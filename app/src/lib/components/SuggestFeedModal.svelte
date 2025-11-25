<script lang="ts">
  import { supabase } from "$lib/services/supabase";
  import { user } from "$lib/stores/auth";
  import { X, PartyPopper } from "lucide-svelte";
  import confetti from "canvas-confetti";

  interface Props {
    isOpen: boolean;
    onSuccess?: () => void;
  }

  let { isOpen = $bindable(), onSuccess }: Props = $props();

  let feedUrl = $state("");
  let reason = $state("");
  let submitting = $state(false);
  let errorMessage = $state("");
  let successMessage = $state("");
  let showSuccessState = $state(false);

  function triggerConfetti() {
    // Fire confetti from both sides
    const duration = 2000;
    const end = Date.now() + duration;

    const colors = ["#22c55e", "#3b82f6", "#a855f7", "#f59e0b"];

    (function frame() {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors: colors,
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors: colors,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    })();
  }

  // Extract a readable title from the URL
  function getTitleFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      let domain = urlObj.hostname.replace("www.", "");
      const path = urlObj.pathname;

      // YouTube - extract channel name
      if (domain.includes("youtube.com")) {
        const channelMatch = path.match(
          /\/@([^\/]+)|\/channel\/([^\/]+)|\/c\/([^\/]+)|\/user\/([^\/]+)/
        );
        if (channelMatch) {
          return (
            channelMatch[1] ||
            channelMatch[2] ||
            channelMatch[3] ||
            channelMatch[4]
          );
        }
        return "YouTube Channel";
      }

      // GitHub - extract username/repo
      if (domain.includes("github.com")) {
        const ghMatch = path.match(/^\/([^\/]+)(?:\/([^\/]+))?/);
        if (ghMatch) {
          if (ghMatch[2]) {
            return `${ghMatch[1]}/${ghMatch[2]}`; // user/repo
          }
          return ghMatch[1]; // just username
        }
        return "GitHub";
      }

      // Reddit - extract subreddit
      if (domain.includes("reddit.com")) {
        const subredditMatch = path.match(/\/r\/([^\/]+)/);
        if (subredditMatch) {
          return `r/${subredditMatch[1]}`;
        }
        return "Reddit";
      }

      // Medium - extract username or publication
      if (domain.includes("medium.com")) {
        const mediumMatch = path.match(/^\/@([^\/]+)|^\/([^\/]+)/);
        if (mediumMatch) {
          return mediumMatch[1] || mediumMatch[2];
        }
        return "Medium";
      }

      // Substack - extract from subdomain
      if (domain.includes("substack.com")) {
        const subdomain = domain.split(".")[0];
        if (subdomain !== "substack") {
          return subdomain.charAt(0).toUpperCase() + subdomain.slice(1);
        }
        return "Substack";
      }

      // Twitter/X
      if (domain.includes("twitter.com") || domain.includes("x.com")) {
        const twitterMatch = path.match(/^\/([^\/]+)/);
        if (
          twitterMatch &&
          !["home", "explore", "search"].includes(twitterMatch[1])
        ) {
          return `@${twitterMatch[1]}`;
        }
        return "Twitter/X";
      }

      // LinkedIn
      if (domain.includes("linkedin.com")) return "LinkedIn";

      // News sites
      if (domain.includes("techcrunch.com")) return "TechCrunch";
      if (domain.includes("theverge.com")) return "The Verge";
      if (domain.includes("arstechnica.com")) return "Ars Technica";
      if (domain.includes("hackernews") || domain.includes("ycombinator.com"))
        return "Hacker News";
      if (domain.includes("bbc.com") || domain.includes("bbc.co.uk"))
        return "BBC";
      if (domain.includes("nytimes.com")) return "NY Times";
      if (domain.includes("washingtonpost.com")) return "Washington Post";
      if (domain.includes("cnn.com")) return "CNN";
      if (domain.includes("reuters.com")) return "Reuters";
      if (domain.includes("bloomberg.com")) return "Bloomberg";

      // Extract main domain name and capitalize
      const parts = domain.split(".");
      const mainDomain = parts.length > 2 ? parts[parts.length - 2] : parts[0];
      return mainDomain.charAt(0).toUpperCase() + mainDomain.slice(1);
    } catch {
      return "Feed";
    }
  }

  async function handleSubmit() {
    if (!$user) return;

    // Basic validation
    if (!feedUrl.trim()) {
      errorMessage = "Feed URL is required";
      return;
    }

    // Validate URL format
    try {
      new URL(feedUrl);
    } catch (e) {
      errorMessage =
        "Please enter a valid URL (e.g., https://example.com/feed)";
      return;
    }

    submitting = true;
    errorMessage = "";
    successMessage = "";

    try {
      // Extract title from URL
      const extractedTitle = getTitleFromUrl(feedUrl.trim());

      const { error } = await supabase.rpc("submit_feed_suggestion" as any, {
        p_feed_url: feedUrl.trim(),
        p_feed_title: extractedTitle,
        p_feed_description: null,
        p_reason: reason.trim() || null,
      });

      if (error) throw error;

      // Show success state with confetti
      showSuccessState = true;
      triggerConfetti();
    } catch (err: any) {
      console.error("Error submitting suggestion:", err);
      errorMessage = err.message || "Failed to submit suggestion";
    } finally {
      submitting = false;
    }
  }

  function closeModal() {
    if (!submitting) {
      errorMessage = "";
      successMessage = "";
      isOpen = false;
    }
  }

  function closeSuccess() {
    feedUrl = "";
    reason = "";
    showSuccessState = false;
    isOpen = false;
    onSuccess?.();
  }

  // Reset form when modal opens
  $effect(() => {
    if (isOpen) {
      feedUrl = "";
      reason = "";
      errorMessage = "";
      successMessage = "";
      showSuccessState = false;
    }
  });
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    onclick={closeModal}
    onkeydown={(e) => e.key === "Escape" && closeModal()}
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    aria-labelledby="suggest-feed-title"
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="bg-card border border-border rounded-lg w-full max-w-lg mx-4 p-6 shadow-2xl"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        {#if !showSuccessState}
          <h2
            id="suggest-feed-title"
            class="text-2xl font-bold text-foreground"
          >
            Suggest a Feed
          </h2>
        {:else}
          <div></div>
        {/if}
        <button
          onclick={showSuccessState ? closeSuccess : closeModal}
          disabled={submitting}
          class="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          aria-label="Close modal"
        >
          <X size={24} />
        </button>
      </div>

      <!-- Success State -->
      {#if showSuccessState}
        <div class="text-center py-6">
          <div
            class="mb-4 inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20"
          >
            <PartyPopper size={32} class="text-green-500" />
          </div>
          <h3 class="text-xl font-bold text-foreground mb-2">
            Suggestion Submitted!
          </h3>
          <p class="text-muted-foreground mb-4">
            You'll be automatically subscribed to this feed as soon as it's
            available.
          </p>
          <div
            class="bg-primary/10 border border-primary/30 rounded-lg p-4 text-left"
          >
            <p class="text-sm text-foreground">
              <span class="font-medium">What happens next?</span>
            </p>
            <ul class="mt-2 text-sm text-muted-foreground space-y-1">
              <li class="flex items-start gap-2">
                <span class="text-primary mt-0.5">1.</span>
                <span>We'll review your suggestion</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-primary mt-0.5">2.</span>
                <span>Once approved, the feed will be added</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-primary mt-0.5">3.</span>
                <span
                  >You'll be subscribed automatically - no action needed!</span
                >
              </li>
            </ul>
          </div>
        </div>
      {:else}
        <!-- Form -->
        <form
          onsubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <div class="space-y-4">
            <!-- Feed URL (Required) -->
            <div>
              <label
                for="feedUrl"
                class="block text-sm font-medium text-foreground mb-2"
              >
                Feed URL <span class="text-red-500">*</span>
              </label>
              <input
                id="feedUrl"
                type="url"
                bind:value={feedUrl}
                placeholder="https://example.com/feed"
                required
                disabled={submitting}
                class="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              />
              <p class="mt-1 text-xs text-muted-foreground">
                Enter the RSS/URL you'd like to suggest
              </p>
            </div>

            <!-- Reason (Optional) -->
            <div>
              <label
                for="reason"
                class="block text-sm font-medium text-foreground mb-2"
              >
                Why should we add this feed? (Optional)
              </label>
              <textarea
                id="reason"
                bind:value={reason}
                rows="3"
                placeholder="Tell us why this feed would be valuable..."
                disabled={submitting}
                class="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              ></textarea>
              <p class="mt-1 text-xs text-muted-foreground">
                Providing a reason for the feed is highly likely to be approved
              </p>
            </div>

            <!-- Error Message -->
            {#if errorMessage}
              <div
                class="bg-red-500/10 border border-red-500/50 rounded-lg p-3"
              >
                <p class="text-sm text-red-500">{errorMessage}</p>
              </div>
            {/if}

            <!-- Buttons -->
            <div class="flex gap-3 pt-2">
              <button
                type="button"
                onclick={closeModal}
                disabled={submitting}
                class="flex-1 px-4 py-2 border border-border rounded-lg text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !feedUrl.trim()}
                class="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {#if submitting}
                  <svg
                    class="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      class="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      stroke-width="4"
                    ></circle>
                    <path
                      class="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Submitting...
                {:else}
                  Submit Suggestion
                {/if}
              </button>
            </div>
          </div>
        </form>
      {/if}
    </div>
  </div>
{/if}
