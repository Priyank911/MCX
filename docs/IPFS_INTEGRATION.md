# IPFS Integration with Pinata

This extension now includes IPFS integration using Pinata for decentralized workspace storage and synchronization.

## Features

### 🔄 Workspace Commit to IPFS
- Captures complete workspace state including files, chat history, and settings
- Stores data as JSON on IPFS via Pinata
- Updates existing CID if workspace was previously committed
- No local JSON files are created (all stored on IPFS)

### 📥 Workspace Sync from IPFS
- Download and restore workspace state from any IPFS CID
- Recreates file structure and content
- Restores chat history and settings (where possible)

## Configuration

### Environment Variables (.env)
```env
# Pinata IPFS Configuration
PINATA_API_KEY=your_api_key_here
PINATA_API_SECRET=your_api_secret_here  
PINATA_JWT=your_jwt_token_here
PINATA_GATEWAY=gateway.pinata.cloud
```

### VS Code Settings
Alternatively, you can configure via VS Code settings:
- `cline.pinata.jwt`: Your Pinata JWT token
- `cline.pinata.gateway`: Custom gateway URL (optional)
- `cline.workspace.ipfsCID`: Current workspace CID (auto-managed)

## Commands

### Commit Workspace to IPFS
- **Command ID**: `cline.pluginIPFSCommitClicked`
- **Title**: "Commit Workspace to IPFS"
- **Icon**: Cloud upload
- **Action**: Serializes workspace and uploads to Pinata IPFS

### Sync Workspace from IPFS  
- **Command ID**: `cline.pluginIPFSSyncClicked`
- **Title**: "Sync Workspace from IPFS"
- **Icon**: Cloud download
- **Action**: Downloads workspace state from IPFS CID and restores locally

## How It Works

### Commit Process
1. **Serialization**: Captures workspace state including:
   - All text files (up to 100 files, excludes node_modules)
   - Folder structure
   - Cline chat messages and history
   - API configuration
   - Auto-approval settings
   - Browser settings

2. **IPFS Upload**: 
   - Creates JSON file with workspace data
   - Uploads to Pinata IPFS
   - If CID exists, unpins old version and pins new one
   - Updates workspace settings with new CID

3. **CID Management**: 
   - Each workspace tracks its current CID
   - Same workspace updates same CID (no duplicates)
   - CID stored in workspace-specific settings

### Sync Process
1. **CID Input**: User provides IPFS CID to sync from
2. **Download**: Retrieves JSON data from IPFS via Pinata gateway  
3. **Validation**: Ensures valid workspace state format
4. **Restoration**: 
   - Creates folder structure
   - Restores all files with original content
   - Updates workspace settings
   - Preserves chat history and configuration

## Security

- Credentials stored in `.env` file (not committed to git)
- Fallback to VS Code settings for JWT token
- No sensitive data exposed in IPFS JSON
- Uses secure Pinata authentication

## Usage Examples

### First Time Setup
1. Get Pinata credentials from [Pinata Dashboard](https://app.pinata.cloud/)
2. Add credentials to `.env` file or VS Code settings
3. Open your workspace in VS Code
4. Use "Commit Workspace to IPFS" command
5. Copy the generated CID for sharing

### Team Collaboration
1. Team member commits workspace: `QmXXXXXX...`
2. Share CID with team
3. Other team members use "Sync Workspace from IPFS"
4. Enter the shared CID
5. Workspace restored locally with all files and history

### Cross-Device Sync
1. Commit workspace on Device A
2. Note the CID from notification
3. On Device B, sync using the same CID
4. Continue working with identical workspace state

## Troubleshooting

### "Pinata IPFS not configured" Error
- Ensure JWT token is set in `.env` or VS Code settings
- Verify Pinata credentials are valid
- Check network connectivity

### "Failed to commit to IPFS" Error  
- Verify Pinata API limits and quotas
- Check file size limits (large workspaces may exceed limits)
- Ensure workspace has valid files to commit

### "Failed to load from IPFS" Error
- Verify CID is valid and exists on IPFS
- Check gateway connectivity
- Ensure CID contains valid workspace data

## Current Pinata Configuration

Your current configuration:
- **API Key**: `b32521081fb73790f005`
- **JWT Token**: Configured in `.env`
- **Gateway**: `gateway.pinata.cloud`

The extension is ready to use! Use the commit command to start storing your workspace on IPFS.