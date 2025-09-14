// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below

import assert from "node:assert"
import { setTimeout as setTimeoutPromise } from "node:timers/promises"
import { DIFF_VIEW_URI_SCHEME } from "@hosts/vscode/VscodeDiffViewProvider"
import { WebviewProviderType as WebviewProviderTypeEnum } from "@shared/proto/cline/ui"
import * as vscode from "vscode"
import { sendAccountButtonClickedEvent } from "./core/controller/ui/subscribeToAccountButtonClicked"
import { sendChatButtonClickedEvent } from "./core/controller/ui/subscribeToChatButtonClicked"
import { sendHistoryButtonClickedEvent } from "./core/controller/ui/subscribeToHistoryButtonClicked"
import { sendMcpButtonClickedEvent } from "./core/controller/ui/subscribeToMcpButtonClicked"
import { sendSettingsButtonClickedEvent } from "./core/controller/ui/subscribeToSettingsButtonClicked"
import { WebviewProvider } from "./core/webview"
import { createClineAPI } from "./exports"
import { Logger } from "./services/logging/Logger"
import { cleanupTestMode, initializeTestMode } from "./services/test/TestMode"
import { WebviewProviderType } from "./shared/webview/types"
import "./utils/path"; // necessary to have access to String.prototype.toPosix

import path from "node:path"
import type { ExtensionContext } from "vscode"
import { HostProvider } from "@/hosts/host-provider"
import { vscodeHostBridgeClient } from "@/hosts/vscode/hostbridge/client/host-grpc-client"
import { readTextFromClipboard, writeTextToClipboard } from "@/utils/env"
import { initialize, tearDown } from "./common"
import { addToCline } from "./core/controller/commands/addToCline"
import { explainWithCline } from "./core/controller/commands/explainWithCline"
import { fixWithCline } from "./core/controller/commands/fixWithCline"
import { improveWithCline } from "./core/controller/commands/improveWithCline"
import { sendAddToInputEvent } from "./core/controller/ui/subscribeToAddToInput"
import { sendFocusChatInputEvent } from "./core/controller/ui/subscribeToFocusChatInput"
import { workspaceResolver } from "./core/workspace"
import { focusChatInput, getContextForCommand } from "./hosts/vscode/commandUtils"
import { VscodeDiffViewProvider } from "./hosts/vscode/VscodeDiffViewProvider"
import { VscodeWebviewProvider } from "./hosts/vscode/VscodeWebviewProvider"
import { GitCommitGenerator } from "./integrations/git/commit-message-generator"
import { ExtensionRegistryInfo } from "./registry"
import { AuthService } from "./services/auth/AuthService"
import { telemetryService } from "./services/telemetry"
import { SharedUriHandler } from "./services/uri/SharedUriHandler"
import { ShowMessageType } from "./shared/proto/host/window"
import { fileExistsAtPath } from "./utils/fs"
/*
Built using https://github.com/microsoft/vscode-webview-ui-toolkit

Inspired by
https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/default/weather-webview
https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/frameworks/hello-world-react-cra

*/

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	setupHostProvider(context)

	const sidebarWebview = (await initialize(context)) as VscodeWebviewProvider

	Logger.log("Cline extension activated")

	// Initialize user profile and collect email if needed
	try {
		const { UserProfileService } = await import('./services/user/UserProfileService')
		await UserProfileService.handleUserRegistration()
	} catch (error) {
		Logger.error("Failed to initialize user profile:", error)
	}

	const testModeWatchers = await initializeTestMode(sidebarWebview)
	// Initialize test mode and add disposables to context
	context.subscriptions.push(...testModeWatchers)

	vscode.commands.executeCommand("setContext", "cline.isDevMode", IS_DEV && IS_DEV === "true")

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(VscodeWebviewProvider.SIDEBAR_ID, sidebarWebview, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
	)

	const { commands } = ExtensionRegistryInfo

	context.subscriptions.push(
		vscode.commands.registerCommand(commands.PlusButton, async (webview: any) => {
			console.log("[DEBUG] plusButtonClicked", webview)
			// Pass the webview type to the event sender
			const isSidebar = !webview

			const openChat = async (instance: WebviewProvider) => {
				await instance?.controller.clearTask()
				await instance?.controller.postStateToWebview()
				await sendChatButtonClickedEvent(instance.controller.id)
			}

			if (isSidebar) {
				const sidebarInstance = WebviewProvider.getSidebarInstance()
				if (sidebarInstance) {
					openChat(sidebarInstance)
					// Send event to the sidebar instance
				}
			} else {
				const tabInstances = WebviewProvider.getTabInstances()
				for (const instance of tabInstances) {
					openChat(instance)
				}
			}
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand(commands.PluginButton, async (webview: any) => {
			console.log("[DEBUG] pluginButtonClicked", webview)
			
			// Create dropdown menu options
			const quickPickItems = [
				{
					label: "$(map) Mapp: in",
					description: "Advanced mapping and integration features",
					command: commands.PluginMappIn
				},
				{
					label: "$(git-commit) Commit",
					description: "Enhanced commit management tools",
					command: commands.PluginCommit
				}
			]

			// Show quick pick dropdown
			const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
				placeHolder: "Select a plugin feature",
				matchOnDescription: true
			})

			if (selectedItem) {
				// Execute the selected command
				await vscode.commands.executeCommand(selectedItem.command)
			}
		}),
	)

	// Plugin dropdown option handlers
	context.subscriptions.push(
		vscode.commands.registerCommand(commands.PluginMappIn, async () => {
			console.log("[DEBUG] pluginMappInClicked")
			// Placeholder for Mapp: in functionality
			const result = await vscode.window.showInformationMessage(
				"🗺️ Mapp: in feature selected!\n\nThis will provide advanced mapping and integration capabilities.",
				{ modal: false },
				"Configure", "Learn More"
			)
			
			if (result === "Configure") {
				vscode.window.showInformationMessage("🔧 Configuration panel coming soon!")
			} else if (result === "Learn More") {
				vscode.window.showInformationMessage("📚 Documentation will be available here!")
			}
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand(commands.PluginCommit, async () => {
			console.log("[DEBUG] pluginCommitClicked")
			
			try {
				// Show progress indicator
				await vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					title: "Generating AI Summary and Storing on IPFS",
					cancellable: false
				}, async (progress) => {
					progress.report({ increment: 0, message: "Initializing chat summarization..." });
					
					// Try multiple ways to get an active instance with conversation data
					let activeInstance = WebviewProvider.getActiveInstance()
					if (!activeInstance) {
						activeInstance = WebviewProvider.getVisibleInstance()
					}
					if (!activeInstance) {
						activeInstance = WebviewProvider.getSidebarInstance()
					}
					if (!activeInstance) {
						// Try to get any available instance
						const allInstances = WebviewProvider.getAllInstances()
						activeInstance = allInstances.length > 0 ? allInstances[0] : undefined
					}
					
					if (!activeInstance) {
						throw new Error("No Cline instance found. Please ensure the Cline sidebar is open.")
					}
					
					const controller = activeInstance.controller
					if (!controller) {
						throw new Error("No active controller found")
					}
					
					// Check if there are any messages to summarize
					const messages = controller.task?.messageStateHandler.getClineMessages() || []
					if (messages.length === 0) {
						throw new Error("No chat messages found to summarize. Start a conversation with Cline first.")
					}
					
					progress.report({ increment: 30, message: "Analyzing chat messages..." });
					
					// Import and run the AI summarization service
					const { summarizeChatHistoryWithAI } = await import('./core/services/aiChatSummarizer')
					
					progress.report({ increment: 50, message: "Generating AI-powered summary..." });
					
					// Run AI summarization and get the summary data instead of writing to file
					const summaryData = await generateAISummaryData(controller, context.extensionPath)
					
					progress.report({ increment: 70, message: "Uploading summary to IPFS..." });
					
					// Upload to IPFS instead of saving locally
					const cid = await uploadSummaryToIPFS(summaryData)
					
					if (cid) {
						progress.report({ increment: 100, message: "AI summary uploaded to IPFS successfully!" });
					} else {
						throw new Error("Failed to upload summary to IPFS")
					}
				});
				
				// Show success message with IPFS CID
				const result = await vscode.window.showInformationMessage(
					"✅ AI Chat Summary Complete!\n\nYour intelligent conversation summary has been stored on IPFS (no local file created).",
					{ modal: false },
					"Copy IPFS CID", "View on IPFS"
				)
				
				// Handle user actions for IPFS content
				if (result === "Copy IPFS CID") {
					// Copy CID to clipboard
					const config = vscode.workspace.getConfiguration("cline")
					const cid = config.get<string>("lastSummaryCID")
					if (cid) {
						await vscode.env.clipboard.writeText(cid)
						vscode.window.showInformationMessage(`IPFS CID copied: ${cid}`)
					}
				} else if (result === "View on IPFS") {
					// Open IPFS gateway URL
					const config = vscode.workspace.getConfiguration("cline")
					const cid = config.get<string>("lastSummaryCID")
					if (cid) {
						const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${cid}`
						await vscode.env.openExternal(vscode.Uri.parse(gatewayUrl))
					}
				}
				
			} catch (error) {
				console.error("Error during chat summarization:", error)
				vscode.window.showErrorMessage(
					`❌ Chat Summarization Failed: ${error instanceof Error ? error.message : 'Unknown error'}`
				)
			}
		}),
	)

	// IPFS Commit Command
	context.subscriptions.push(
		vscode.commands.registerCommand(commands.PluginIPFSCommit, async () => {
			console.log("[DEBUG] pluginIPFSCommitClicked - Starting IPFS commit...")
			
			try {
				// Show immediate feedback
				vscode.window.showInformationMessage("Starting IPFS commit...");
				
				const { PinataService } = await import('./services/ipfs/PinataService')
				
				// Get workspace ID
				const workspaceFolders = vscode.workspace.workspaceFolders
				if (!workspaceFolders || workspaceFolders.length === 0) {
					throw new Error("No workspace folder found")
				}
				
				const workspaceId = workspaceFolders[0].name
				console.log("[DEBUG] Workspace ID:", workspaceId);
				
				const pinataService = new PinataService(workspaceId)
				
				// Check if Pinata JWT is configured
				const config = vscode.workspace.getConfiguration("cline")
				let jwt = config.get<string>("pinata.jwt")
				
				// Fallback to environment variable or hardcoded JWT for development
				if (!jwt) {
					jwt = process.env.PINATA_JWT
				}
				
				// Development fallback - use your provided JWT token
				if (!jwt) {
					jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiIzZTFkNzQ5YS05NTg2LTRhZWItOWRkNC0wNzQzZGZkMWRkMDgiLCJlbWFpbCI6InByaXlhbmt0ZWNocGFuY2hhbEBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiYjMyNTIxMDgxZmI3Mzc5MGYwMDUiLCJzY29wZWRLZXlTZWNyZXQiOiI1NjJlNDkxMTc5ZWQ5ZDY2MGQxNWZmOGYxMDRlOWRkMjAwZWU5MWY1OWI1NzNmNThkNzVhZjE3MTM0NTZkNWQyIiwiZXhwIjoxNzg5MzI3MTM2fQ.pqkOlJYoXHTvPBfwe5xN3aoELp55WTR45UvGsBCaQyE"
				}
				
				console.log("[DEBUG] JWT found:", !!jwt);
				console.log("[DEBUG] JWT source:", config.get<string>("pinata.jwt") ? "VS Code settings" : process.env.PINATA_JWT ? "Environment variable" : "Hardcoded fallback");
				
				if (!jwt) {
					const result = await vscode.window.showWarningMessage(
						"Pinata IPFS not configured. Please set your Pinata JWT token in settings or environment variables.",
						"Open Settings"
					)
					
					if (result === "Open Settings") {
						await vscode.commands.executeCommand('workbench.action.openSettings', 'cline.pinata.jwt')
					}
					return
				}
				
				// Show progress and commit to IPFS
				await vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					title: "Committing Workspace to IPFS",
					cancellable: false
				}, async (progress) => {
					console.log("[DEBUG] Starting IPFS upload process...");
					progress.report({ increment: 0, message: "Initializing IPFS connection..." });
					
					progress.report({ increment: 30, message: "Serializing workspace state..." });
					
					progress.report({ increment: 60, message: "Uploading to Pinata IPFS..." });
					
					console.log("[DEBUG] Calling pinataService.commitToIPFS()...");
					const cid = await pinataService.commitToIPFS()
					console.log("[DEBUG] IPFS commit result CID:", cid);
					
					if (cid) {
						progress.report({ increment: 100, message: "Workspace committed successfully!" });
						console.log("[DEBUG] IPFS commit successful, CID:", cid);
					} else {
						console.error("[DEBUG] IPFS commit failed - no CID returned");
						throw new Error("Failed to commit workspace to IPFS")
					}
				});
				
			} catch (error) {
				console.error("Error during IPFS commit:", error)
				vscode.window.showErrorMessage(
					`❌ IPFS Commit Failed: ${error instanceof Error ? error.message : 'Unknown error'}`
				)
			}
		}),
	)

	// IPFS Sync Command
	context.subscriptions.push(
		vscode.commands.registerCommand(commands.PluginIPFSSync, async () => {
			console.log("[DEBUG] pluginIPFSSyncClicked")
			
			try {
				const { PinataService } = await import('./services/ipfs/PinataService')
				
				// Get workspace ID
				const workspaceFolders = vscode.workspace.workspaceFolders
				if (!workspaceFolders || workspaceFolders.length === 0) {
					throw new Error("No workspace folder found")
				}
				
				const workspaceId = workspaceFolders[0].name
				const pinataService = new PinataService(workspaceId)
				
				// Check if Pinata JWT is configured
				const config = vscode.workspace.getConfiguration("cline")
				let jwt = config.get<string>("pinata.jwt")
				
				// Fallback to environment variable or hardcoded JWT for development
				if (!jwt) {
					jwt = process.env.PINATA_JWT
				}
				
				// Development fallback - use your provided JWT token
				if (!jwt) {
					jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiIzZTFkNzQ5YS05NTg2LTRhZWItOWRkNC0wNzQzZGZkMWRkMDgiLCJlbWFpbCI6InByaXlhbmt0ZWNocGFuY2hhbEBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiYjMyNTIxMDgxZmI3Mzc5MGYwMDUiLCJzY29wZWRLZXlTZWNyZXQiOiI1NjJlNDkxMTc5ZWQ5ZDY2MGQxNWZmOGYxMDRlOWRkMjAwZWU5MWY1OWI1NzNmNThkNzVhZjE3MTM0NTZkNWQyIiwiZXhwIjoxNzg5MzI3MTM2fQ.pqkOlJYoXHTvPBfwe5xN3aoELp55WTR45UvGsBCaQyE"
				}
				
				if (!jwt) {
					const result = await vscode.window.showWarningMessage(
						"Pinata IPFS not configured. Please set your Pinata JWT token in settings or environment variables.",
						"Open Settings"
					)
					
					if (result === "Open Settings") {
						await vscode.commands.executeCommand('workbench.action.openSettings', 'cline.pinata.jwt')
					}
					return
				}
				
				// Ask for CID to sync from
				const cid = await vscode.window.showInputBox({
					prompt: "Enter IPFS CID to sync workspace from",
					placeHolder: "QmXXXXXX... (IPFS hash)",
					validateInput: (value) => {
						if (!value || value.length < 10) {
							return "Please enter a valid IPFS CID"
						}
						return null
					}
				})
				
				if (!cid) {
					return // User cancelled
				}
				
				// Show progress and sync from IPFS
				await vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					title: "Syncing Workspace from IPFS",
					cancellable: false
				}, async (progress) => {
					progress.report({ increment: 0, message: "Connecting to IPFS..." });
					
					progress.report({ increment: 30, message: "Downloading workspace state..." });
					
					const workspaceState = await pinataService.loadFromIPFS(cid)
					
					if (!workspaceState) {
						throw new Error("Failed to load workspace state from IPFS")
					}
					
					progress.report({ increment: 70, message: "Restoring files and folders..." });
					
					await pinataService.syncFromIPFS(workspaceState)
					
					progress.report({ increment: 100, message: "Workspace synced successfully!" });
				});
				
			} catch (error) {
				console.error("Error during IPFS sync:", error)
				vscode.window.showErrorMessage(
					`❌ IPFS Sync Failed: ${error instanceof Error ? error.message : 'Unknown error'}`
				)
			}
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand(commands.McpButton, (webview: any) => {
			console.log("[DEBUG] mcpButtonClicked", webview)

			const activeInstance = WebviewProvider.getActiveInstance()
			const isSidebar = !webview

			if (isSidebar) {
				const sidebarInstance = WebviewProvider.getSidebarInstance()
				const sidebarInstanceId = sidebarInstance?.getClientId()
				if (sidebarInstanceId) {
					sendMcpButtonClickedEvent(sidebarInstanceId)
				} else {
					console.error("[DEBUG] No sidebar instance found, cannot send MCP button event")
				}
			} else {
				const activeInstanceId = activeInstance?.getClientId()
				if (activeInstanceId) {
					sendMcpButtonClickedEvent(activeInstanceId)
				} else {
					console.error("[DEBUG] No active instance found, cannot send MCP button event")
				}
			}
		}),
	)

	const openClineInNewTab = async () => {
		Logger.log("Opening Cline in new tab")
		// (this example uses webviewProvider activation event which is necessary to deserialize cached webview, but since we use retainContextWhenHidden, we don't need to use that event)
		// https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
		const tabWebview = HostProvider.get().createWebviewProvider(WebviewProviderType.TAB) as VscodeWebviewProvider
		const lastCol = Math.max(...vscode.window.visibleTextEditors.map((editor) => editor.viewColumn || 0))

		// Check if there are any visible text editors, otherwise open a new group to the right
		const hasVisibleEditors = vscode.window.visibleTextEditors.length > 0
		if (!hasVisibleEditors) {
			await vscode.commands.executeCommand("workbench.action.newGroupRight")
		}
		const targetCol = hasVisibleEditors ? Math.max(lastCol + 1, 1) : vscode.ViewColumn.Two

		const panel = vscode.window.createWebviewPanel(VscodeWebviewProvider.TAB_PANEL_ID, "Cline", targetCol, {
			enableScripts: true,
			retainContextWhenHidden: true,
			localResourceRoots: [context.extensionUri],
		})
		// TODO: use better svg icon with light and dark variants (see https://stackoverflow.com/questions/58365687/vscode-extension-iconpath)

		panel.iconPath = {
			light: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "robot_panel_light.png"),
			dark: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "robot_panel_dark.png"),
		}
		tabWebview.resolveWebviewView(panel)

		// Lock the editor group so clicking on files doesn't open them over the panel
		await setTimeoutPromise(100)
		await vscode.commands.executeCommand("workbench.action.lockEditorGroup")
		return tabWebview
	}

	context.subscriptions.push(vscode.commands.registerCommand(commands.PopoutButton, openClineInNewTab))
	context.subscriptions.push(vscode.commands.registerCommand(commands.OpenInNewTab, openClineInNewTab))

	context.subscriptions.push(
		vscode.commands.registerCommand(commands.SettingsButton, (webview: any) => {
			const isSidebar = !webview
			const webviewType = isSidebar ? WebviewProviderTypeEnum.SIDEBAR : WebviewProviderTypeEnum.TAB

			sendSettingsButtonClickedEvent(webviewType)
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand(commands.HistoryButton, async (webview: any) => {
			console.log("[DEBUG] historyButtonClicked", webview)
			// Pass the webview type to the event sender
			const isSidebar = !webview
			const webviewType = isSidebar ? WebviewProviderTypeEnum.SIDEBAR : WebviewProviderTypeEnum.TAB

			// Send event to all subscribers using the gRPC streaming method
			await sendHistoryButtonClickedEvent(webviewType)
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand(commands.AccountButton, (webview: any) => {
			console.log("[DEBUG] accountButtonClicked", webview)

			const isSidebar = !webview
			if (isSidebar) {
				const sidebarInstance = WebviewProvider.getSidebarInstance()
				if (sidebarInstance) {
					// Send event to sidebar controller
					sendAccountButtonClickedEvent(sidebarInstance.controller.id)
				}
			} else {
				// Send to all tab instances
				const tabInstances = WebviewProvider.getTabInstances()
				for (const instance of tabInstances) {
					sendAccountButtonClickedEvent(instance.controller.id)
				}
			}
		}),
	)

	/*
	We use the text document content provider API to show the left side for diff view by creating a 
	virtual document for the original content. This makes it readonly so users know to edit the right 
	side if they want to keep their changes.

	- This API allows you to create readonly documents in VSCode from arbitrary sources, and works by 
	claiming an uri-scheme for which your provider then returns text contents. The scheme must be 
	provided when registering a provider and cannot change afterwards.
	- Note how the provider doesn't create uris for virtual documents - its role is to provide contents
	 given such an uri. In return, content providers are wired into the open document logic so that 
	 providers are always considered.
	https://code.visualstudio.com/api/extension-guides/virtual-documents
	*/
	const diffContentProvider = new (class implements vscode.TextDocumentContentProvider {
		provideTextDocumentContent(uri: vscode.Uri): string {
			return Buffer.from(uri.query, "base64").toString("utf-8")
		}
	})()
	context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(DIFF_VIEW_URI_SCHEME, diffContentProvider))

	const handleUri = async (uri: vscode.Uri) => {
		const url = decodeURIComponent(uri.toString())
		const success = await SharedUriHandler.handleUri(url)
		if (!success) {
			console.warn("Extension URI handler: Failed to process URI:", uri.toString())
		}
	}
	context.subscriptions.push(vscode.window.registerUriHandler({ handleUri }))

	// Register size testing commands in development mode
	if (IS_DEV && IS_DEV === "true") {
		// Use dynamic import to avoid loading the module in production
		import("./dev/commands/tasks")
			.then((module) => {
				const devTaskCommands = module.registerTaskCommands(context, sidebarWebview.controller)
				context.subscriptions.push(...devTaskCommands)
				Logger.log("Cline dev task commands registered")
			})
			.catch((error) => {
				Logger.log("Failed to register dev task commands: " + error)
			})
	}

	context.subscriptions.push(
		vscode.commands.registerCommand(commands.TerminalOutput, async () => {
			const terminal = vscode.window.activeTerminal
			if (!terminal) {
				return
			}

			// Save current clipboard content
			const tempCopyBuffer = await readTextFromClipboard()

			try {
				// Copy the *existing* terminal selection (without selecting all)
				await vscode.commands.executeCommand("workbench.action.terminal.copySelection")

				// Get copied content
				const terminalContents = (await readTextFromClipboard()).trim()

				// Restore original clipboard content
				await writeTextToClipboard(tempCopyBuffer)

				if (!terminalContents) {
					// No terminal content was copied (either nothing selected or some error)
					return
				}
				// Ensure the sidebar view is visible
				await focusChatInput()

				await sendAddToInputEvent(`Terminal output:\n\`\`\`\n${terminalContents}\n\`\`\``)

				console.log("addSelectedTerminalOutputToChat", terminalContents, terminal.name)
			} catch (error) {
				// Ensure clipboard is restored even if an error occurs
				await writeTextToClipboard(tempCopyBuffer)
				console.error("Error getting terminal contents:", error)
				HostProvider.window.showMessage({
					type: ShowMessageType.ERROR,
					message: "Failed to get terminal contents",
				})
			}
		}),
	)

	// Register code action provider
	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider(
			"*",
			new (class implements vscode.CodeActionProvider {
				public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix, vscode.CodeActionKind.Refactor]

				provideCodeActions(
					document: vscode.TextDocument,
					range: vscode.Range,
					context: vscode.CodeActionContext,
				): vscode.CodeAction[] {
					const CONTEXT_LINES_TO_EXPAND = 3
					const START_OF_LINE_CHAR_INDEX = 0
					const LINE_COUNT_ADJUSTMENT_FOR_ZERO_INDEXING = 1

					const actions: vscode.CodeAction[] = []
					const editor = vscode.window.activeTextEditor // Get active editor for selection check

					// Expand range to include surrounding 3 lines or use selection if broader
					const selection = editor?.selection
					let expandedRange = range
					if (
						editor &&
						selection &&
						!selection.isEmpty &&
						selection.contains(range.start) &&
						selection.contains(range.end)
					) {
						expandedRange = selection
					} else {
						expandedRange = new vscode.Range(
							Math.max(0, range.start.line - CONTEXT_LINES_TO_EXPAND),
							START_OF_LINE_CHAR_INDEX,
							Math.min(
								document.lineCount - LINE_COUNT_ADJUSTMENT_FOR_ZERO_INDEXING,
								range.end.line + CONTEXT_LINES_TO_EXPAND,
							),
							document.lineAt(
								Math.min(
									document.lineCount - LINE_COUNT_ADJUSTMENT_FOR_ZERO_INDEXING,
									range.end.line + CONTEXT_LINES_TO_EXPAND,
								),
							).text.length,
						)
					}

					// Add to Cline (Always available)
					const addAction = new vscode.CodeAction("Add to Cline", vscode.CodeActionKind.QuickFix)
					addAction.command = {
						command: commands.AddToChat,
						title: "Add to Cline",
						arguments: [expandedRange, context.diagnostics],
					}
					actions.push(addAction)

					// Explain with Cline (Always available)
					const explainAction = new vscode.CodeAction("Explain with Cline", vscode.CodeActionKind.RefactorExtract) // Using a refactor kind
					explainAction.command = {
						command: commands.ExplainCode,
						title: "Explain with Cline",
						arguments: [expandedRange],
					}
					actions.push(explainAction)

					// Improve with Cline (Always available)
					const improveAction = new vscode.CodeAction("Improve with Cline", vscode.CodeActionKind.RefactorRewrite) // Using a refactor kind
					improveAction.command = {
						command: commands.ImproveCode,
						title: "Improve with Cline",
						arguments: [expandedRange],
					}
					actions.push(improveAction)

					// Fix with Cline (Only if diagnostics exist)
					if (context.diagnostics.length > 0) {
						const fixAction = new vscode.CodeAction("Fix with Cline", vscode.CodeActionKind.QuickFix)
						fixAction.isPreferred = true
						fixAction.command = {
							command: commands.FixWithCline,
							title: "Fix with Cline",
							arguments: [expandedRange, context.diagnostics],
						}
						actions.push(fixAction)
					}
					return actions
				}
			})(),
			{
				providedCodeActionKinds: [
					vscode.CodeActionKind.QuickFix,
					vscode.CodeActionKind.RefactorExtract,
					vscode.CodeActionKind.RefactorRewrite,
				],
			},
		),
	)

	// Register the command handlers
	context.subscriptions.push(
		vscode.commands.registerCommand(commands.AddToChat, async (range?: vscode.Range, diagnostics?: vscode.Diagnostic[]) => {
			const context = await getContextForCommand(range, diagnostics)
			if (!context) {
				return
			}
			await addToCline(context.controller, context.commandContext)
		}),
	)
	context.subscriptions.push(
		vscode.commands.registerCommand(commands.FixWithCline, async (range: vscode.Range, diagnostics: vscode.Diagnostic[]) => {
			const context = await getContextForCommand(range, diagnostics)
			if (!context) {
				return
			}
			await fixWithCline(context.controller, context.commandContext)
		}),
	)
	context.subscriptions.push(
		vscode.commands.registerCommand(commands.ExplainCode, async (range: vscode.Range) => {
			const context = await getContextForCommand(range)
			if (!context) {
				return
			}
			await explainWithCline(context.controller, context.commandContext)
		}),
	)
	context.subscriptions.push(
		vscode.commands.registerCommand(commands.ImproveCode, async (range: vscode.Range) => {
			const context = await getContextForCommand(range)
			if (!context) {
				return
			}
			await improveWithCline(context.controller, context.commandContext)
		}),
	)

	// Register the focusChatInput command handler
	context.subscriptions.push(
		vscode.commands.registerCommand(commands.FocusChatInput, async () => {
			// Fast path: check for existing active instance
			let activeWebview = WebviewProvider.getLastActiveInstance() as VscodeWebviewProvider

			if (activeWebview) {
				// Instance exists - just reveal and focus it
				const webview = activeWebview.getWebview()
				if (webview) {
					if (webview && "reveal" in webview) {
						webview.reveal()
					} else if ("show" in webview) {
						webview.show()
					}
				}
			} else {
				// No active instance - need to find or create one
				WebviewProvider.setLastActiveControllerId(null)

				// Check for existing tab instances first (cheaper than focusing sidebar)
				const tabInstances = WebviewProvider.getTabInstances() as VscodeWebviewProvider[]
				if (tabInstances.length > 0) {
					activeWebview = tabInstances[tabInstances.length - 1]
				} else {
					// Try to focus sidebar via hostbridge
					await HostProvider.workspace.openClineSidebarPanel({})

					// Small delay for focus to complete
					await new Promise((resolve) => setTimeout(resolve, 200))
					activeWebview = WebviewProvider.getSidebarInstance() as VscodeWebviewProvider
					if (!activeWebview) {
						// Last resort: create new tab
						activeWebview = (await openClineInNewTab()) as VscodeWebviewProvider
					}
				}
			}

			// Send focus event
			const clientId = activeWebview?.getClientId()
			if (!clientId) {
				console.error("FocusChatInput: Could not find or activate a Cline webview to focus.")
				HostProvider.window.showMessage({
					type: ShowMessageType.ERROR,
					message: "Could not activate Cline view. Please try opening it manually from the Activity Bar.",
				})
				return
			}

			sendFocusChatInputEvent(clientId)
			telemetryService.captureButtonClick("command_focusChatInput", activeWebview.controller?.task?.ulid)
		}),
	)

	// Register the openWalkthrough command handler
	context.subscriptions.push(
		vscode.commands.registerCommand(commands.Walkthrough, async () => {
			await vscode.commands.executeCommand("workbench.action.openWalkthrough", `${context.extension.id}#ClineWalkthrough`)
			telemetryService.captureButtonClick("command_openWalkthrough")
		}),
	)

	// Register the generateGitCommitMessage command handler
	context.subscriptions.push(
		vscode.commands.registerCommand(commands.GenerateCommit, async (scm) => {
			await GitCommitGenerator?.generate?.(context, scm)
		}),
		vscode.commands.registerCommand(commands.AbortCommit, () => {
			GitCommitGenerator?.abort?.()
		}),
	)

	context.subscriptions.push(
		context.secrets.onDidChange(async (event) => {
			if (event.key === "clineAccountId") {
				// Check if the secret was removed (logout) or added/updated (login)
				const secretValue = await context.secrets.get("clineAccountId")
				const activeWebviewProvider = WebviewProvider.getVisibleInstance()
				const controller = activeWebviewProvider?.controller

				const authService = AuthService.getInstance(controller)
				if (secretValue) {
					// Secret was added or updated - restore auth info (login from another window)
					authService?.restoreRefreshTokenAndRetrieveAuthInfo()
				} else {
					// Secret was removed - handle logout for all windows
					authService?.handleDeauth()
				}
			}
		}),
	)

	return createClineAPI(sidebarWebview.controller)
}

function setupHostProvider(context: ExtensionContext) {
	console.log("Setting up vscode host providers...")

	const createWebview = (type: WebviewProviderType) => new VscodeWebviewProvider(context, type)
	const createDiffView = () => new VscodeDiffViewProvider()
	const outputChannel = vscode.window.createOutputChannel("Cline")
	context.subscriptions.push(outputChannel)

	const getCallbackUri = async () => `${vscode.env.uriScheme || "vscode"}://${context.extension.id}`
	HostProvider.initialize(
		createWebview,
		createDiffView,
		vscodeHostBridgeClient,
		outputChannel.appendLine,
		getCallbackUri,
		getBinaryLocation,
	)
}

async function getBinaryLocation(name: string): Promise<string> {
	// The only binary currently supported is the rg binary from the VSCode installation.
	if (!name.startsWith("rg")) {
		throw new Error(`Binary '${name}' is not supported`)
	}

	const checkPath = async (pkgFolder: string) => {
		const fullPathResult = workspaceResolver.resolveWorkspacePath(
			vscode.env.appRoot,
			path.join(pkgFolder, name),
			"Services.ripgrep.getBinPath",
		)
		const fullPath = typeof fullPathResult === "string" ? fullPathResult : fullPathResult.absolutePath
		return (await fileExistsAtPath(fullPath)) ? fullPath : undefined
	}

	const binPath =
		(await checkPath("node_modules/@vscode/ripgrep/bin/")) ||
		(await checkPath("node_modules/vscode-ripgrep/bin")) ||
		(await checkPath("node_modules.asar.unpacked/vscode-ripgrep/bin/")) ||
		(await checkPath("node_modules.asar.unpacked/@vscode/ripgrep/bin/"))
	if (!binPath) {
		throw new Error("Could not find ripgrep binary")
	}
	return binPath
}

/**
 * Generate AI summary data without writing to file
 */
async function generateAISummaryData(controller: any, extensionPath: string): Promise<any> {
	try {
		// Get user email from MCX protocol settings
		let userEmail = "unknown@example.com"
		try {
			const { UserProfileService } = await import('./services/user/UserProfileService')
			const profile = await UserProfileService.getUserProfile()
			userEmail = profile?.email || "unknown@example.com"
		} catch (error) {
			console.warn("Could not retrieve user email:", error)
		}
		
		// Get the messages
		const messages = controller.task?.messageStateHandler.getClineMessages() || []
		
		// Create a comprehensive summary data structure with user email
		const summary = {
			user: {
				email: userEmail
			},
			sessionId: `ai-session-${Date.now()}`,
			timestamp: new Date().toISOString(),
			messageCount: messages.length,
			aiSummary: {
				overview: "AI-generated conversation summary stored on IPFS",
				keyTopics: extractKeyTopics(messages),
				codeChanges: extractCodeChanges(messages),
				decisions: extractDecisions(messages),
				nextSteps: extractNextSteps(messages)
			},
			conversationHistory: messages.map((msg: any, index: number) => ({
				id: index + 1,
				type: msg.type,
				timestamp: msg.ts ? new Date(msg.ts).toISOString() : new Date().toISOString(),
				content: truncateContent(msg.text || msg.say || '', 500),
				...(msg.images && msg.images.length > 0 && { hasImages: true }),
				...(msg.files && msg.files.length > 0 && { hasFiles: true })
			}))
		}
		
		return summary
	} catch (error) {
		console.error("Error generating AI summary data:", error)
		throw error
	}
}

/**
 * Upload summary data to IPFS using Pinata
 */
async function uploadSummaryToIPFS(summaryData: any): Promise<string | null> {
	try {
		const { PinataSDK } = await import('pinata-web3')
		
		// Use the hardcoded JWT token
		const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiIzZTFkNzQ5YS05NTg2LTRhZWItOWRkNC0wNzQzZGZkMWRkMDgiLCJlbWFpbCI6InByaXlhbmt0ZWNocGFuY2hhbEBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiYjMyNTIxMDgxZmI3Mzc5MGYwMDUiLCJzY29wZWRLZXlTZWNyZXQiOiI1NjJlNDkxMTc5ZWQ5ZDY2MGQxNWZmOGYxMDRlOWRkMjAwZWU5MWY1OWI1NzNmNThkNzVhZjE3MTM0NTZkNWQyIiwiZXhwIjoxNzg5MzI3MTM2fQ.pqkOlJYoXHTvPBfwe5xN3aoELp55WTR45UvGsBCaQyE"
		
		const pinata = new PinataSDK({
			pinataJwt: jwt,
			pinataGateway: "gateway.pinata.cloud"
		})
		
		// Create JSON content
		const jsonContent = JSON.stringify(summaryData, null, 2)
		const blob = new Blob([jsonContent], { type: 'application/json' })
		const file = new File([blob], `ai-summary-${summaryData.sessionId}.json`, { type: 'application/json' })
		
		// Upload to IPFS with enhanced metadata including user email
		const result = await pinata.upload.file(file, {
			metadata: {
				name: `${summaryData.sessionId}`,
				keyValues: {
					type: "ai-summary",
					sessionId: summaryData.sessionId,
					timestamp: summaryData.timestamp,
					messageCount: summaryData.messageCount.toString(),
					userEmail: summaryData.user?.email || "unknown@example.com"
				}
			}
		})
		
		console.log("[DEBUG] AI Summary uploaded to IPFS:", result.IpfsHash)
		console.log("[DEBUG] User email included:", summaryData.user?.email)
		
		// Store the CID in settings for later reference
		const config = vscode.workspace.getConfiguration("cline")
		await config.update("lastSummaryCID", result.IpfsHash, vscode.ConfigurationTarget.Workspace)
		
		// Send email notification to user
		try {
			const { UserProfileService } = await import('./services/user/UserProfileService')
			const userEmail = summaryData.user?.email
			if (userEmail && userEmail !== "unknown@example.com") {
				await UserProfileService.sendIPFSCommitNotification(userEmail, result.IpfsHash, "AI Summary")
			}
		} catch (error) {
			console.warn("Failed to send email notification:", error)
		}
		
		return result.IpfsHash
		
	} catch (error) {
		console.error("Error uploading summary to IPFS:", error)
		vscode.window.showErrorMessage(`Failed to upload summary to IPFS: ${error}`)
		return null
	}
}

/**
 * Helper functions for extracting data from messages
 */
function extractKeyTopics(messages: any[]): string[] {
	const topics = new Set<string>()
	messages.forEach(msg => {
		const text = msg.text || msg.say || ''
		// Simple keyword extraction
		if (text.toLowerCase().includes('implement')) topics.add('Implementation')
		if (text.toLowerCase().includes('bug') || text.toLowerCase().includes('fix')) topics.add('Bug Fixes')
		if (text.toLowerCase().includes('test')) topics.add('Testing')
		if (text.toLowerCase().includes('deploy')) topics.add('Deployment')
		if (text.toLowerCase().includes('refactor')) topics.add('Refactoring')
		if (text.toLowerCase().includes('ipfs')) topics.add('IPFS Integration')
		if (text.toLowerCase().includes('pinata')) topics.add('Pinata Storage')
	})
	return Array.from(topics)
}

function extractCodeChanges(messages: any[]): string[] {
	const changes: string[] = []
	messages.forEach(msg => {
		if (msg.type === 'ask' && msg.text) {
			const text = msg.text
			if (text.includes('file') || text.includes('code') || text.includes('function')) {
				changes.push(truncateContent(text, 100))
			}
		}
	})
	return changes.slice(0, 5) // Limit to 5 changes
}

function extractDecisions(messages: any[]): string[] {
	const decisions: string[] = []
	messages.forEach(msg => {
		const text = msg.text || msg.say || ''
		if (text.toLowerCase().includes('decide') || text.toLowerCase().includes('choice') || text.toLowerCase().includes('option')) {
			decisions.push(truncateContent(text, 100))
		}
	})
	return decisions.slice(0, 3) // Limit to 3 decisions
}

function extractNextSteps(messages: any[]): string[] {
	const steps: string[] = []
	const lastMessages = messages.slice(-5) // Look at last 5 messages
	lastMessages.forEach(msg => {
		const text = msg.text || msg.say || ''
		if (text.toLowerCase().includes('next') || text.toLowerCase().includes('todo') || text.toLowerCase().includes('should')) {
			steps.push(truncateContent(text, 100))
		}
	})
	return steps.slice(0, 3) // Limit to 3 steps
}

function truncateContent(content: string, maxLength: number): string {
	if (content.length <= maxLength) return content
	return content.substring(0, maxLength) + '...'
}

// This method is called when your extension is deactivated
export async function deactivate() {
	tearDown()

	// Clean up test mode
	cleanupTestMode()

	Logger.log("Cline extension deactivated")
}

// TODO: Find a solution for automatically removing DEV related content from production builds.
//  This type of code is fine in production to keep. We just will want to remove it from production builds
//  to bring down built asset sizes.
//
// This is a workaround to reload the extension when the source code changes
// since vscode doesn't support hot reload for extensions
const IS_DEV = process.env.IS_DEV
const DEV_WORKSPACE_FOLDER = process.env.DEV_WORKSPACE_FOLDER

// Set up development mode file watcher
if (IS_DEV && IS_DEV !== "false") {
	assert(DEV_WORKSPACE_FOLDER, "DEV_WORKSPACE_FOLDER must be set in development")
	const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(DEV_WORKSPACE_FOLDER, "src/**/*"))

	watcher.onDidChange(({ scheme, path }) => {
		console.info(`${scheme} ${path} changed. Reloading VSCode...`)

		vscode.commands.executeCommand("workbench.action.reloadWindow")
	})
}
