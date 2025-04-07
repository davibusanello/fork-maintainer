/**
 * @deprecated This feature is no longer supported by GitHub's API
 *
 * GitHub's API does not support disabling actions for personal repositories.
 * Users need to disable GitHub Actions manually through the repository settings interface.
 *
 * This code is kept for historical purposes and as a reference, but it will not work
 * as intended for personal repositories. It may still work for organization repositories
 * if you have the appropriate permissions.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Octokit } from '@octokit/rest';
import type { RestEndpointMethodTypes } from '@octokit/rest';

// Define response types for better type safety
type GetAuthenticatedUserResponse = RestEndpointMethodTypes[ 'users' ][ 'getAuthenticated' ][ 'response' ];
type ListForUserResponse = RestEndpointMethodTypes[ 'repos' ][ 'listForUser' ][ 'response' ];
type GetRepoResponse = RestEndpointMethodTypes[ 'repos' ][ 'get' ][ 'response' ];
type UpdateRepoResponse = RestEndpointMethodTypes[ 'repos' ][ 'update' ][ 'response' ];
type RepoType = ListForUserResponse[ 'data' ][ 0 ];

// Configure with your GitHub personal access token
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

// Path to the file that will store processed fork IDs
const PROCESSED_FORKS_FILE = join(import.meta.dir, '../storage/disabled-actions.json');

interface ProcessedFork {
  name: string;
  original_repository: string;
  processed_at: string;
}

interface ProcessedForks {
  [key: string]: ProcessedFork;
}

async function disableActionsOnForks() {
  try {
    // Load the list of already processed forks
    let processedForks: ProcessedForks = {};
    if (existsSync(PROCESSED_FORKS_FILE)) {
      const fileContent = readFileSync(PROCESSED_FORKS_FILE, 'utf8');
      processedForks = JSON.parse(fileContent);
    }

    // Get the authenticated user
    const { data: user }: GetAuthenticatedUserResponse = await octokit.users.getAuthenticated();
    const username = user.login;

    console.log(`Finding forks for user: ${username}`);

    // Get all repositories for the user
    const { data: repos }: ListForUserResponse = await octokit.repos.listForUser({
      username,
      per_page: 100
    });

    // Filter to only get forks
    const forks = repos.filter((repo: RepoType) => repo.fork === true);

    console.log(`Found ${forks.length} forked repositories.`);
    let processedCount = 0;
    let skippedCount = 0;
    let archivedCount = 0;

    // Disable Actions on each unprocessed fork
    for (const fork of forks) {
      const forkId = fork.id.toString();

      // Skip if already processed
      if (processedForks[forkId]) {
        console.log(`⏭️ Already processed: ${username}/${fork.name}`);
        skippedCount++;
        continue;
      }

      // Skip if repository is archived
      if (fork.archived) {
        console.log(`📦 Skipping archived repository: ${username}/${fork.name}`);
        archivedCount++;

        // Mark archived repository as processed to avoid checking it again
        processedForks[ forkId ] = {
          name: fork.name,
          original_repository: "unknown", // We'll get this below if needed
          processed_at: new Date().toISOString()
        };

      // Try to get the original repository info even for archived repos
        try {
          const { data: repoDetails }: GetRepoResponse = await octokit.repos.get({
            owner: username,
            repo: fork.name
          });

          if (repoDetails.parent) {
            processedForks[ forkId ].original_repository = `${repoDetails.parent.owner.login}/${repoDetails.parent.name}`;
          }
        } catch (error) {
          if (error instanceof Error) {
            console.error(`Could not fetch parent repo info for ${fork.name}: ${error.message}`);
          }
        }
        continue;
      }

      try {
        // Disable GitHub Actions using the correct endpoint
        await octokit.rest.actions.disableSelectedRepositoryGithubActionsOrganization({
          org: username,
          repository_id: parseInt(forkId)
        });

        console.log(`✅ Disabled Actions on ${username}/${fork.name}`);
        processedCount++;

        // Get the original repository information
        let originalRepo = "unknown";
        try {
          // We need to make an additional API call to get the parent repository
          // because the repos.listForUser endpoint doesn't include parent info
          const { data: repoDetails }: GetRepoResponse = await octokit.repos.get({
            owner: username,
            repo: fork.name
          });

          if (repoDetails.parent) {
            originalRepo = `${repoDetails.parent.owner.login}/${repoDetails.parent.name}`;
          }
        } catch (error) {
          if (error instanceof Error) {
            console.error(`Could not fetch parent repo info for ${fork.name}: ${error.message}`);
          }
        }

        // Mark this fork as processed
        processedForks[forkId] = {
          name: fork.name,
          original_repository: originalRepo,
          processed_at: new Date().toISOString()
        };
      } catch (error) {
        if (error instanceof Error) {
          console.error(`❌ Failed to disable Actions on ${username}/${fork.name}: ${error.message}`);
        }
      }
    }

    // Save the updated list of processed forks
    writeFileSync(PROCESSED_FORKS_FILE, JSON.stringify(processedForks, null, 2));

    // Update final console output to include archived repos
    console.log(`\nProcess completed!`);
    console.log(`Disabled Actions on: ${processedCount} forks`);
    console.log(`Skipped already processed: ${skippedCount} forks`);
    console.log(`Skipped archived repositories: ${archivedCount} forks`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error in script: ${error.message}`);
    }
  }
}

// Run the function
disableActionsOnForks();
