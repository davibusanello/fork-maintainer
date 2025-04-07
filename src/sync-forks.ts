import { Octokit } from '@octokit/rest';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RestEndpointMethodTypes } from '@octokit/rest';

// Define response types for better type safety
type GetAuthenticatedUserResponse = RestEndpointMethodTypes[ 'users' ][ 'getAuthenticated' ][ 'response' ];
type GetRepoResponse = RestEndpointMethodTypes[ 'repos' ][ 'get' ][ 'response' ];
type MergeUpstreamResponse = RestEndpointMethodTypes[ 'repos' ][ 'mergeUpstream' ][ 'response' ];
type ListForUserResponse = RestEndpointMethodTypes[ 'repos' ][ 'listForUser' ][ 'response' ];
type RepoType = ListForUserResponse[ 'data' ][ 0 ];

// Configure with your GitHub personal access token
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

// Path to the file that will store sync history
const SYNC_HISTORY_FILE = join(import.meta.dir, '../storage/synced-forks-history.json');

interface SyncRecord {
  name: string;
  original_repository: string;
  last_sync_status: 'success' | 'failed' | 'skipped';
  last_synced: string;
  error?: string;
  sync_history: Array<{
    status: 'success' | 'failed' | 'skipped';
    synced_at: string;
    error?: string;
    message?: string;
  }>;
}

interface SyncHistory {
  [ key: string ]: SyncRecord;
}

/**
 * Updates the sync history for a repository
 */
function updateSyncHistory(
  syncHistory: SyncHistory,
  forkId: string,
  name: string,
  originalRepo: string,
  status: 'success' | 'failed' | 'skipped',
  error?: string,
  message?: string
): void {
  const currentTime = new Date().toISOString();

  if (!syncHistory[ forkId ]) {
    syncHistory[ forkId ] = {
      name,
      original_repository: originalRepo,
      last_sync_status: status,
      last_synced: currentTime,
      sync_history: []
    };
  }

  syncHistory[ forkId ].last_sync_status = status;
  syncHistory[ forkId ].last_synced = currentTime;
  if (error) syncHistory[ forkId ].error = error;

  syncHistory[ forkId ].sync_history.push({
    status,
    synced_at: currentTime,
    ...(error && { error }),
    ...(message && { message })
  });
}

async function syncForks() {
  try {
    // Load existing sync history if available
    let syncHistory: SyncHistory = {};
    if (existsSync(SYNC_HISTORY_FILE)) {
      const historyContent = readFileSync(SYNC_HISTORY_FILE, 'utf8');
      syncHistory = JSON.parse(historyContent);
    }

    // Get the authenticated user with proper typing
    const { data: user }: GetAuthenticatedUserResponse = await octokit.users.getAuthenticated();
    const username = user.login;

    console.log(`Finding forks for user: ${username}`);

    // Get all repositories for the user with pagination
    const repos: RepoType[] = await octokit.paginate('GET /users/{username}/repos', {
      username,
      per_page: 100,
      type: 'owner'
    });

    // Filter to only get forks
    const forks = repos.filter(repo => repo.fork === true);

    console.log(`Found ${forks.length} forked repositories.`);
    let syncedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    // Process each fork
    for (const fork of forks) {
      const forkId = fork.id.toString();

      // Skip archived repositories
      if (fork.archived) {
        console.log(`📦 Skipping archived repository: ${username}/${fork.name}`);
        updateSyncHistory(
          syncHistory,
          forkId,
          fork.name,
          'unknown',
          'skipped',
          undefined,
          'Repository is archived'
        );
        skippedCount++;
        continue;
      }

      try {
        // Get the repository details to find the parent with proper typing
        const { data: repoDetails }: GetRepoResponse = await octokit.repos.get({
          owner: username,
          repo: fork.name
        });

        if (!repoDetails.parent) {
          console.log(`⚠️ No parent repository found for ${username}/${fork.name}`);
          updateSyncHistory(
            syncHistory,
            forkId,
            fork.name,
            'unknown',
            'skipped',
            'No parent repository found'
          );
          skippedCount++;
          continue;
        }

        const originalRepo = `${repoDetails.parent.owner.login}/${repoDetails.parent.name}`;

        try {
          // Try to sync with upstream with proper typing
          const { data: mergeResult }: MergeUpstreamResponse = await octokit.repos.mergeUpstream({
            owner: username,
            repo: fork.name,
            branch: repoDetails.default_branch
          });

          if (mergeResult.merge_type === 'none') {
            console.log(`ℹ️ No changes needed for ${username}/${fork.name} (${mergeResult.message || 'Already up to date'})`);
          } else {
            console.log(`✅ Successfully synced ${username}/${fork.name} with ${originalRepo}`);
          }

          updateSyncHistory(
            syncHistory,
            forkId,
            fork.name,
            originalRepo,
            'success',
            undefined,
            mergeResult.message || `Merged via ${mergeResult.merge_type}`
          );
          syncedCount++;

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`❌ Failed to sync ${username}/${fork.name}: ${errorMessage}`);

          updateSyncHistory(
            syncHistory,
            forkId,
            fork.name,
            originalRepo,
            'failed',
            errorMessage
          );
          failedCount++;
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Failed to get repository details for ${username}/${fork.name}: ${errorMessage}`);

        updateSyncHistory(
          syncHistory,
          forkId,
          fork.name,
          'unknown',
          'failed',
          errorMessage
        );
        failedCount++;
      }

      // Add a small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Save the updated sync history
    writeFileSync(SYNC_HISTORY_FILE, JSON.stringify(syncHistory, null, 2));

    // Print final summary
    console.log('\nSync process completed!');
    console.log('======================');
    console.log(`✅ Successfully synced: ${syncedCount} forks`);
    console.log(`❌ Failed to sync: ${failedCount} forks`);
    console.log(`⏭️ Skipped repositories: ${skippedCount} forks`);

  } catch (error) {
    console.error(`Error in script: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Run the sync function
syncForks();
