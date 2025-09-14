import { PinataSDK } from "pinata-web3"
import * as vscode from "vscode"

export interface WorkspaceState {
	version: string
	timestamp: string
	workspaceId: string
	apiConfiguration: any
	clineMessages: any[]
	currentTask: any
	autoApprovalSettings: any
	browserSettings: any
	files: { [filePath: string]: string }
	folders: string[]
}

export interface PinataConfig {
	jwt: string
	gateway?: string
}

export class PinataService {
	private pinata: PinataSDK | null = null
	private workspaceId: string
	private currentCID: string | null = null

	constructor(workspaceId: string) {
		this.workspaceId = workspaceId
	}

	/**
	 * Initialize Pinata SDK with user credentials
	 */
	async initialize(config: PinataConfig): Promise<boolean> {
		try {
			this.pinata = new PinataSDK({
				pinataJwt: config.jwt,
				pinataGateway: config.gateway || "gateway.pinata.cloud"
			})

			// Test connection
			await this.pinata.testAuthentication()
			return true
		} catch (error) {
			console.error("Failed to initialize Pinata:", error)
			vscode.window.showErrorMessage(`Failed to connect to Pinata: ${error}`)
			return false
		}
	}

	/**
	 * Get Pinata configuration from VS Code settings or environment variables
	 */
	private getPinataConfig(): PinataConfig | null {
		// First try VS Code settings
		const config = vscode.workspace.getConfiguration("cline")
		let jwt = config.get<string>("pinata.jwt")
		let gateway = config.get<string>("pinata.gateway")

		// Fallback to environment variables
		if (!jwt) {
			jwt = process.env.PINATA_JWT
		}
		if (!gateway) {
			gateway = process.env.PINATA_GATEWAY || "gateway.pinata.cloud"
		}

		// Development fallback - use your provided JWT token
		if (!jwt) {
			jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiIzZTFkNzQ5YS05NTg2LTRhZWItOWRkNC0wNzQzZGZkMWRkMDgiLCJlbWFpbCI6InByaXlhbmt0ZWNocGFuY2hhbEBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiYjMyNTIxMDgxZmI3Mzc5MGYwMDUiLCJzY29wZWRLZXlTZWNyZXQiOiI1NjJlNDkxMTc5ZWQ5ZDY2MGQxNWZmOGYxMDRlOWRkMjAwZWU5MWY1OWI1NzNmNThkNzVhZjE3MTM0NTZkNWQyIiwiZXhwIjoxNzg5MzI3MTM2fQ.pqkOlJYoXHTvPBfwe5xN3aoELp55WTR45UvGsBCaQyE"
		}

		if (!jwt) {
			return null
		}

		return {
			jwt,
			gateway: gateway || "gateway.pinata.cloud"
		}
	}

	/**
	 * Ensure Pinata is initialized
	 */
	private async ensureInitialized(): Promise<boolean> {
		if (this.pinata) {
			return true
		}

		const config = this.getPinataConfig()
		if (!config) {
			vscode.window.showWarningMessage(
				"Pinata IPFS not configured. Please set your Pinata JWT in settings."
			)
			return false
		}

		return await this.initialize(config)
	}

	/**
	 * Serialize workspace state to JSON
	 */
	private async serializeWorkspaceState(): Promise<WorkspaceState> {
		const extensionStateProvider = vscode.extensions.getExtension("saoudrizwan.claude-dev")?.exports?.getStateProvider?.()
		
		// Get current workspace files (only text files, not binary)
		const files: { [filePath: string]: string } = {}
		const folders: string[] = []

		if (vscode.workspace.workspaceFolders) {
			for (const workspaceFolder of vscode.workspace.workspaceFolders) {
				const pattern = new vscode.RelativePattern(workspaceFolder, "**/*")
				const uris = await vscode.workspace.findFiles(pattern, "**/node_modules/**")

				for (const uri of uris.slice(0, 100)) { // Limit to 100 files to avoid huge JSON
					try {
						const stat = await vscode.workspace.fs.stat(uri)
						if (stat.type === vscode.FileType.File) {
							const content = await vscode.workspace.fs.readFile(uri)
							const text = Buffer.from(content).toString('utf8')
							
							// Only include text files (skip binary files)
							if (this.isTextFile(text)) {
								const relativePath = vscode.workspace.asRelativePath(uri)
								files[relativePath] = text
							}
						} else if (stat.type === vscode.FileType.Directory) {
							folders.push(vscode.workspace.asRelativePath(uri))
						}
					} catch (error) {
						// Skip files that can't be read
						console.warn(`Could not read file ${uri.fsPath}:`, error)
					}
				}
			}
		}

		return {
			version: "1.0.0",
			timestamp: new Date().toISOString(),
			workspaceId: this.workspaceId,
			apiConfiguration: extensionStateProvider?.getApiConfiguration?.() || {},
			clineMessages: extensionStateProvider?.getClineMessages?.() || [],
			currentTask: extensionStateProvider?.getCurrentTask?.() || null,
			autoApprovalSettings: extensionStateProvider?.getAutoApprovalSettings?.() || {},
			browserSettings: extensionStateProvider?.getBrowserSettings?.() || {},
			files,
			folders
		}
	}

	/**
	 * Check if content is a text file
	 */
	private isTextFile(content: string): boolean {
		// Check for null bytes which indicate binary content
		return !content.includes('\0')
	}

	/**
	 * Commit workspace state to IPFS
	 * If CID exists for this workspace, update it; otherwise create new
	 */
	async commitToIPFS(): Promise<string | null> {
		console.log("[DEBUG] PinataService.commitToIPFS() called");
		
		if (!(await this.ensureInitialized())) {
			console.error("[DEBUG] Failed to initialize Pinata");
			return null
		}

		try {
			console.log("[DEBUG] Serializing workspace state...");
			const workspaceState = await this.serializeWorkspaceState()
			console.log("[DEBUG] Workspace state serialized, files count:", Object.keys(workspaceState.files).length);
			
			const jsonData = JSON.stringify(workspaceState, null, 2)
			console.log("[DEBUG] JSON data size:", jsonData.length, "characters");

			// Create a Blob from the JSON data
			const blob = new Blob([jsonData], { type: 'application/json' })
			const file = new File([blob], `workspace-${this.workspaceId}.json`, { type: 'application/json' })
			console.log("[DEBUG] Created file for upload:", file.name, file.size, "bytes");

			let result: any

			if (this.currentCID) {
				// Update existing file
				console.log("[DEBUG] Updating existing CID:", this.currentCID);
				vscode.window.showInformationMessage("Updating workspace state on IPFS...")
				
				// For updates, we need to unpin the old CID and pin the new one
				try {
					console.log("[DEBUG] Unpinning old CID...");
					await this.pinata!.unpin([this.currentCID])
				} catch (error) {
					console.warn("Could not unpin old CID:", error)
				}
			} else {
				console.log("[DEBUG] Creating new workspace state on IPFS...");
				vscode.window.showInformationMessage("Creating new workspace state on IPFS...")
			}

			// Pin new file
			console.log("[DEBUG] Uploading file to Pinata...");
			
			// Get user email for metadata
			let userEmail = "unknown@example.com"
			try {
				const { UserProfileService } = await import('../user/UserProfileService')
				const profile = UserProfileService.getUserProfile()
				userEmail = profile?.email || "unknown@example.com"
			} catch (error) {
				console.warn("Could not retrieve user email for IPFS metadata:", error)
			}
			
			result = await this.pinata!.upload.file(file, {
				metadata: {
					name: `Cline Workspace ${this.workspaceId}`,
					keyValues: {
						workspaceId: this.workspaceId,
						version: workspaceState.version,
						timestamp: workspaceState.timestamp,
						userEmail: userEmail
					}
				}
			})

			console.log("[DEBUG] Upload result:", result);
			this.currentCID = result.IpfsHash

			// Store CID in workspace settings
			const config = vscode.workspace.getConfiguration("cline")
			await config.update("workspace.ipfsCID", this.currentCID, vscode.ConfigurationTarget.Workspace)

			vscode.window.showInformationMessage(
				`Workspace committed to IPFS: ${this.currentCID}`,
				"Copy CID"
			).then(selection => {
				if (selection === "Copy CID") {
					vscode.env.clipboard.writeText(this.currentCID!)
				}
			})

			// Send email notification
			try {
				const { UserProfileService } = await import('../user/UserProfileService')
				if (userEmail && userEmail !== "unknown@example.com" && this.currentCID) {
					await UserProfileService.sendIPFSCommitNotification(userEmail, this.currentCID, "Workspace Commit")
				}
			} catch (error) {
				console.warn("Failed to send IPFS commit email notification:", error)
			}

			return this.currentCID
		} catch (error) {
			console.error("Failed to commit to IPFS:", error)
			vscode.window.showErrorMessage(`Failed to commit to IPFS: ${error}`)
			return null
		}
	}

	/**
	 * Load workspace state from IPFS CID
	 */
	async loadFromIPFS(cid: string): Promise<WorkspaceState | null> {
		if (!(await this.ensureInitialized())) {
			return null
		}

		try {
			vscode.window.showInformationMessage("Loading workspace state from IPFS...")

			const data = await this.pinata!.gateways.get(cid)
			const workspaceState: WorkspaceState = data.data as unknown as WorkspaceState

			// Validate the data structure
			if (!workspaceState.version || !workspaceState.workspaceId) {
				throw new Error("Invalid workspace state format")
			}

			this.currentCID = cid
			
			// Store CID in workspace settings
			const config = vscode.workspace.getConfiguration("cline")
			await config.update("workspace.ipfsCID", cid, vscode.ConfigurationTarget.Workspace)

			vscode.window.showInformationMessage(`Workspace state loaded from IPFS: ${cid}`)
			return workspaceState
		} catch (error) {
			console.error("Failed to load from IPFS:", error)
			vscode.window.showErrorMessage(`Failed to load from IPFS: ${error}`)
			return null
		}
	}

	/**
	 * Sync workspace with IPFS (restore files and state)
	 */
	async syncFromIPFS(workspaceState: WorkspaceState): Promise<boolean> {
		try {
			vscode.window.showInformationMessage("Syncing workspace from IPFS...")

			// Create folders first
			if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0]) {
				const workspaceUri = vscode.workspace.workspaceFolders[0].uri

				for (const folder of workspaceState.folders) {
					const folderUri = vscode.Uri.joinPath(workspaceUri, folder)
					try {
						await vscode.workspace.fs.createDirectory(folderUri)
					} catch (error) {
						// Folder might already exist
					}
				}

				// Restore files
				for (const [relativePath, content] of Object.entries(workspaceState.files)) {
					const fileUri = vscode.Uri.joinPath(workspaceUri, relativePath)
					
					// Create parent directories if they don't exist
					const parentUri = vscode.Uri.joinPath(fileUri, "..")
					try {
						await vscode.workspace.fs.createDirectory(parentUri)
					} catch (error) {
						// Directory might already exist
					}

					// Write file content
					const contentBytes = Buffer.from(content, 'utf8')
					await vscode.workspace.fs.writeFile(fileUri, contentBytes)
				}
			}

			// TODO: Restore extension state (API configuration, messages, etc.)
			// This would require integration with the extension's state management

			vscode.window.showInformationMessage("Workspace synced successfully from IPFS!")
			return true
		} catch (error) {
			console.error("Failed to sync from IPFS:", error)
			vscode.window.showErrorMessage(`Failed to sync from IPFS: ${error}`)
			return false
		}
	}

	/**
	 * Get current CID for this workspace
	 */
	getCurrentCID(): string | null {
		if (this.currentCID) {
			return this.currentCID
		}

		// Try to get from workspace settings
		const config = vscode.workspace.getConfiguration("cline")
		return config.get<string>("workspace.ipfsCID") || null
	}

	/**
	 * Set current CID for this workspace
	 */
	setCurrentCID(cid: string) {
		this.currentCID = cid
	}
}