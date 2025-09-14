import * as vscode from "vscode"

export interface UserProfile {
	uid: string
	email: string
	displayName?: string
	photoURL?: string
	walletAddress?: string
	subscriptionTier?: 'free' | 'pro' | 'enterprise'
	ipfsQuota?: number
	apiUsage?: {
		monthly: number
		limit: number
	}
}

export interface AuthState {
	isAuthenticated: boolean
	user?: UserProfile
	token?: string
	refreshToken?: string
}

export class FirebaseAuthService {
	private static instance: FirebaseAuthService
	private authState: AuthState = { isAuthenticated: false }
	private statusBarItem: vscode.StatusBarItem
	private authChangeListeners: ((state: AuthState) => void)[] = []

	private constructor() {
		// Create status bar item for authentication status
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Right,
			100
		)
		this.statusBarItem.command = 'cline.showAuthMenu'
		this.updateStatusBar()
		this.statusBarItem.show()
	}

	public static getInstance(): FirebaseAuthService {
		if (!FirebaseAuthService.instance) {
			FirebaseAuthService.instance = new FirebaseAuthService()
		}
		return FirebaseAuthService.instance
	}

	/**
	 * Initialize authentication - check for stored tokens
	 */
	async initialize(): Promise<void> {
		try {
			console.log("[DEBUG] Initializing FirebaseAuthService...")
			
			// Try to restore authentication from stored tokens
			const storedAuth = await this.getStoredAuth()
			if (storedAuth && storedAuth.token) {
				console.log("[DEBUG] Found stored authentication, verifying...")
				const isValid = await this.verifyToken(storedAuth.token)
				
				if (isValid) {
					this.authState = storedAuth
					this.updateStatusBar()
					this.notifyAuthChange()
					console.log("[DEBUG] Authentication restored successfully")
				} else {
					console.log("[DEBUG] Stored token is invalid, clearing...")
					await this.clearStoredAuth()
				}
			}
		} catch (error) {
			console.error("Error initializing auth service:", error)
		}
	}

	/**
	 * Start the authentication flow
	 */
	async signIn(): Promise<boolean> {
		try {
			// Show authentication options
			const authMethod = await vscode.window.showQuickPick([
				{
					label: "$(globe) Web Browser Sign In",
					description: "Open dashboard in browser to authenticate",
					detail: "Secure OAuth flow via your default browser"
				},
				{
					label: "$(key) Enter Auth Token",
					description: "Manually enter authentication token",
					detail: "If you already have a token from the dashboard"
				}
			], {
				placeHolder: "Choose authentication method",
				ignoreFocusOut: true
			})

			if (!authMethod) {
				return false
			}

			if (authMethod.label.includes("Web Browser")) {
				return await this.signInWithBrowser()
			} else {
				return await this.signInWithToken()
			}

		} catch (error) {
			console.error("Sign in error:", error)
			vscode.window.showErrorMessage(`Authentication failed: ${error}`)
			return false
		}
	}

	/**
	 * Sign in via browser OAuth flow
	 */
	private async signInWithBrowser(): Promise<boolean> {
		try {
			// Generate a unique session ID for this auth attempt
			const sessionId = `vscode-auth-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
			
			// Your dashboard auth URL (you'll need to implement this endpoint)
			const authUrl = `https://your-dashboard.com/auth/vscode?session=${sessionId}&source=extension`
			
			// Open browser for authentication
			await vscode.env.openExternal(vscode.Uri.parse(authUrl))
			
			// Show progress while waiting for authentication
			return await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Waiting for authentication...",
				cancellable: true
			}, async (progress, token) => {
				progress.report({ 
					message: "Complete authentication in your browser. This window will update automatically." 
				})

				// Poll for authentication completion
				return await this.pollForAuthCompletion(sessionId, token)
			})

		} catch (error) {
			console.error("Browser sign in error:", error)
			throw error
		}
	}

	/**
	 * Sign in with manually entered token
	 */
	private async signInWithToken(): Promise<boolean> {
		try {
			const token = await vscode.window.showInputBox({
				prompt: "Enter your authentication token from the dashboard",
				placeHolder: "eyJhbGciOiJIUzI1NiIs...",
				password: true,
				validateInput: (value) => {
					if (!value || value.length < 10) {
						return "Please enter a valid authentication token"
					}
					return null
				}
			})

			if (!token) {
				return false
			}

			// Verify the token with your backend
			const userProfile = await this.verifyAndGetProfile(token)
			
			if (userProfile) {
				this.authState = {
					isAuthenticated: true,
					user: userProfile,
					token: token
				}

				await this.storeAuth(this.authState)
				this.updateStatusBar()
				this.notifyAuthChange()

				vscode.window.showInformationMessage(
					`✅ Successfully authenticated as ${userProfile.email}`
				)

				return true
			}

			throw new Error("Invalid authentication token")

		} catch (error) {
			console.error("Token sign in error:", error)
			throw error
		}
	}

	/**
	 * Poll your backend API for authentication completion
	 */
	private async pollForAuthCompletion(
		sessionId: string, 
		cancellationToken: vscode.CancellationToken
	): Promise<boolean> {
		const maxAttempts = 60 // 5 minutes with 5-second intervals
		let attempts = 0

		while (attempts < maxAttempts && !cancellationToken.isCancellationRequested) {
			try {
				// Check with your backend if authentication is complete
				const response = await fetch(`https://your-dashboard.com/api/auth/check/${sessionId}`)
				
				if (response.ok) {
					const authData = await response.json()
					
					if (authData.authenticated) {
						// Authentication successful
						this.authState = {
							isAuthenticated: true,
							user: authData.user,
							token: authData.token,
							refreshToken: authData.refreshToken
						}

						await this.storeAuth(this.authState)
						this.updateStatusBar()
						this.notifyAuthChange()

						vscode.window.showInformationMessage(
							`✅ Successfully authenticated as ${authData.user.email}`
						)

						return true
					}
				}

				// Wait 5 seconds before next attempt
				await new Promise(resolve => setTimeout(resolve, 5000))
				attempts++

			} catch (error) {
				console.error("Polling error:", error)
				await new Promise(resolve => setTimeout(resolve, 5000))
				attempts++
			}
		}

		if (cancellationToken.isCancellationRequested) {
			vscode.window.showInformationMessage("Authentication cancelled by user")
		} else {
			vscode.window.showErrorMessage("Authentication timed out. Please try again.")
		}

		return false
	}

	/**
	 * Verify token and get user profile
	 */
	private async verifyAndGetProfile(token: string): Promise<UserProfile | null> {
		try {
			const response = await fetch('https://your-dashboard.com/api/auth/verify', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${token}`
				}
			})

			if (response.ok) {
				const data = await response.json()
				return data.user
			}

			return null
		} catch (error) {
			console.error("Token verification error:", error)
			return null
		}
	}

	/**
	 * Verify if a token is still valid
	 */
	private async verifyToken(token: string): Promise<boolean> {
		try {
			const profile = await this.verifyAndGetProfile(token)
			return profile !== null
		} catch {
			return false
		}
	}

	/**
	 * Sign out user
	 */
	async signOut(): Promise<void> {
		try {
			// Revoke token on backend if possible
			if (this.authState.token) {
				try {
					await fetch('https://your-dashboard.com/api/auth/revoke', {
						method: 'POST',
						headers: {
							'Authorization': `Bearer ${this.authState.token}`
						}
					})
				} catch (error) {
					console.error("Error revoking token:", error)
				}
			}

			// Clear local state
			this.authState = { isAuthenticated: false }
			await this.clearStoredAuth()
			this.updateStatusBar()
			this.notifyAuthChange()

			vscode.window.showInformationMessage("Successfully signed out")

		} catch (error) {
			console.error("Sign out error:", error)
			vscode.window.showErrorMessage(`Sign out failed: ${error}`)
		}
	}

	/**
	 * Get current authentication state
	 */
	getAuthState(): AuthState {
		return { ...this.authState }
	}

	/**
	 * Get current user profile
	 */
	getCurrentUser(): UserProfile | null {
		return this.authState.user || null
	}

	/**
	 * Get authentication token for API calls
	 */
	getAuthToken(): string | null {
		return this.authState.token || null
	}

	/**
	 * Check if user is authenticated
	 */
	isAuthenticated(): boolean {
		return this.authState.isAuthenticated
	}

	/**
	 * Add listener for authentication state changes
	 */
	onAuthStateChanged(callback: (state: AuthState) => void): vscode.Disposable {
		this.authChangeListeners.push(callback)
		
		// Call immediately with current state
		callback(this.authState)

		return new vscode.Disposable(() => {
			const index = this.authChangeListeners.indexOf(callback)
			if (index > -1) {
				this.authChangeListeners.splice(index, 1)
			}
		})
	}

	/**
	 * Store authentication data securely
	 */
	private async storeAuth(authState: AuthState): Promise<void> {
		try {
			const config = vscode.workspace.getConfiguration('cline')
			
			// Store non-sensitive data in workspace settings
			await config.update('user.email', authState.user?.email, vscode.ConfigurationTarget.Global)
			await config.update('user.uid', authState.user?.uid, vscode.ConfigurationTarget.Global)
			
			// Store sensitive tokens in VS Code's secret storage
			const extensionContext = vscode.extensions.getExtension('saoudrizwan.claude-dev')?.isActive
			if (extensionContext && authState.token) {
				// You'll need to pass the context from extension.ts
				// For now, we'll store in configuration (not ideal for production)
				await config.update('auth.token', authState.token, vscode.ConfigurationTarget.Global)
			}
		} catch (error) {
			console.error("Error storing auth data:", error)
		}
	}

	/**
	 * Get stored authentication data
	 */
	private async getStoredAuth(): Promise<AuthState | null> {
		try {
			const config = vscode.workspace.getConfiguration('cline')
			const email = config.get<string>('user.email')
			const uid = config.get<string>('user.uid')
			const token = config.get<string>('auth.token')

			if (email && uid && token) {
				return {
					isAuthenticated: true,
					user: { uid, email },
					token
				}
			}

			return null
		} catch (error) {
			console.error("Error getting stored auth:", error)
			return null
		}
	}

	/**
	 * Clear stored authentication data
	 */
	private async clearStoredAuth(): Promise<void> {
		try {
			const config = vscode.workspace.getConfiguration('cline')
			await config.update('user.email', undefined, vscode.ConfigurationTarget.Global)
			await config.update('user.uid', undefined, vscode.ConfigurationTarget.Global)
			await config.update('auth.token', undefined, vscode.ConfigurationTarget.Global)
		} catch (error) {
			console.error("Error clearing auth data:", error)
		}
	}

	/**
	 * Update status bar with authentication status
	 */
	private updateStatusBar(): void {
		if (this.authState.isAuthenticated && this.authState.user) {
			this.statusBarItem.text = `$(account) ${this.authState.user.email}`
			this.statusBarItem.tooltip = `Signed in as ${this.authState.user.email}\nClick to manage account`
			this.statusBarItem.backgroundColor = undefined
		} else {
			this.statusBarItem.text = `$(account) Sign In`
			this.statusBarItem.tooltip = "Click to sign in to your dashboard account"
			this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
		}
	}

	/**
	 * Notify all listeners of authentication state change
	 */
	private notifyAuthChange(): void {
		this.authChangeListeners.forEach(listener => {
			try {
				listener(this.authState)
			} catch (error) {
				console.error("Error in auth state listener:", error)
			}
		})
	}

	/**
	 * Dispose of resources
	 */
	dispose(): void {
		this.statusBarItem.dispose()
		this.authChangeListeners.length = 0
	}
}
