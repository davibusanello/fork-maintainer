# Fork Maintainer

A utility tool to help maintain and sync your GitHub fork repositories. Currently, it focuses on syncing your fork repositories with their upstream repositories.

## Features

- 🔄 Automatically syncs your fork repositories with their upstream repositories
- 📝 Keeps track of sync history and results
- 🔍 Maintains a record of original repositories
- ⏭️ Provides detailed sync status and error reporting

> **Note**: Initially it was intended to also disable GitHub Actions on forks, but GitHub's API does not support disabling actions for personal repositories. You'll need to disable GitHub Actions manually through the repository settings interface.

**If anyone knows how to do it, please feel free to submit a PR.**

## Prerequisites

Choose one of the following runtimes:

### Bun (Recommended)

- Bun v1.0 or higher (includes native TypeScript support)
- GitHub Personal Access Token with repository permissions

### Node.js

- Node.js (v23.6 or higher for native TypeScript support)
- GitHub Personal Access Token with repository permissions

## Installation

1. Clone the repository:

    ```bash
    git clone https://github.com/davibusanello/fork-maintainer.git
    cd fork-maintainer
    ```

2. Install dependencies:

    With Bun (recommended):

    ```bash
    bun install
    ```

    With Node.js:

    ```bash
    npm install
    ```

3. Set up your GitHub token:

    ```bash
    export GITHUB_TOKEN=your_github_personal_access_token
    ```

    Or set it in the `.env` file:

    ```bash
    cp .env.example .env
    ```

    Then edit the `.env` file:

    ```env
    GITHUB_TOKEN=your_github_personal_access_token
    ```

## Usage

Run the script to sync your forks with their upstream repositories:

With Bun:

```bash
bun start-sync-forks
```

With Node.js:

```bash
npm run start-sync-forks
```

The script will:

1. Authenticate with GitHub using your token
2. Find all your fork repositories
3. Sync each fork with its upstream repository
4. Keep track of sync history in `storage/synced-forks-history.json`

## Configuration

You must configure a repository secret named `GH_PERSONAL_ACCESS_TOKEN` with your GitHub Personal Access Token with access to other repositories.

The script uses the following environment variables:

- `GITHUB_TOKEN`: Your GitHub Personal Access Token (required)

## GitHub Action Setup

The project includes a GitHub Action that automatically syncs your forks every 2 days. To set it up:

1. Generate a Fine-grained Personal Access Token:
   - Go to GitHub Settings > Developer settings > Personal access tokens > Fine-grained tokens
   - Click "Generate new token"
   - Configure the token:
     - Token name: "Fork Maintainer"
     - Expiration: Choose your preferred duration (recommended: 1 year)
     - Resource owner: Your GitHub username or organization
     - Repository access: Select "All repositories" (needed to access all your forks)
     - Permissions:
       - Repository permissions:
         - Contents: Read and write (to sync forks and update history)
         - Metadata: Read-only (required for repository information)
         - Actions: Read-only (to check workflow status)
         - Administration: Read-only (to check fork relationships)
   - Click "Generate token"
   - Copy the generated token

2. Add the token as a repository secret:
   - Go to your fork-maintainer repository
   - Navigate to Settings > Secrets and variables > Actions
   - Click "New repository secret"
   - Name: `GH_PERSONAL_ACCESS_TOKEN`
   - Value: Paste your generated token
   - Click "Add secret"

3. The GitHub Action will now:
   - Run automatically every 2 days at midnight UTC
   - Can be triggered manually from the Actions tab
   - Keep your forks in sync with their upstream repositories
   - Maintain a history of syncs in `storage/synced-forks.json`

You can view the sync results in the Actions tab of your repository.

### Customizing the Schedule

The default schedule runs every 2 days. To change this, modify the cron expression in `.github/workflows/sync-forks-with-upstream.yml`:

```yaml
on:
  schedule:
    - cron: '0 0 */2 * *'  # Runs every 2 days at midnight UTC
  workflow_dispatch:        # Allows manual triggers
```

Common cron examples:

- Daily: `0 0 * * *`
- Weekly: `0 0 * * 0`
- Monthly: `0 0 1 * *`

## Project Structure

```text
.
├── src/
│   └── sync-forks.ts          # Main script for syncing forks with upstream
│   └── actions-disabler.ts    # Main script for disabling GitHub Actions (Not working)
├── storage/                   # Directory for storing sync history data
├── .github/                   # GitHub specific configurations
├── LICENSE                    # MIT License
└── README.md                  # This file
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
