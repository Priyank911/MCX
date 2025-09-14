import * as vscode from "vscode"
import { HostProvider } from "@/hosts/host-provider"
import { ShowMessageType, ShowMessageRequest, ShowInputBoxRequest } from "@/shared/proto/host/window"

export interface UserProfile {
	email: string
	registrationDate: string
	lastActivity: string
}

export class UserProfileService {
	private static readonly CONFIG_SECTION = "cline.mcxProtocol"
	private static readonly EMAIL_KEY = "email"
	private static readonly REGISTRATION_DATE_KEY = "registrationDate"
	private static readonly LAST_ACTIVITY_KEY = "lastActivity"

	/**
	 * Check if user email is configured
	 */
	static getUserEmail(): string | null {
		const config = vscode.workspace.getConfiguration()
		return config.get<string>(`${this.CONFIG_SECTION}.${this.EMAIL_KEY}`) || null
	}

	/**
	 * Get complete user profile
	 */
	static getUserProfile(): UserProfile | null {
		const config = vscode.workspace.getConfiguration()
		const email = config.get<string>(`${this.CONFIG_SECTION}.${this.EMAIL_KEY}`)
		
		if (!email) {
			return null
		}

		return {
			email,
			registrationDate: config.get<string>(`${this.CONFIG_SECTION}.${this.REGISTRATION_DATE_KEY}`) || "",
			lastActivity: config.get<string>(`${this.CONFIG_SECTION}.${this.LAST_ACTIVITY_KEY}`) || ""
		}
	}

	/**
	 * Save user email and profile data
	 */
	static async saveUserProfile(email: string): Promise<void> {
		const config = vscode.workspace.getConfiguration()
		const now = new Date().toISOString()

		await config.update(`${this.CONFIG_SECTION}.${this.EMAIL_KEY}`, email, vscode.ConfigurationTarget.Global)
		await config.update(`${this.CONFIG_SECTION}.${this.REGISTRATION_DATE_KEY}`, now, vscode.ConfigurationTarget.Global)
		await config.update(`${this.CONFIG_SECTION}.${this.LAST_ACTIVITY_KEY}`, now, vscode.ConfigurationTarget.Global)
	}

	/**
	 * Update last activity timestamp
	 */
	static async updateLastActivity(): Promise<void> {
		const config = vscode.workspace.getConfiguration()
		const now = new Date().toISOString()
		await config.update(`${this.CONFIG_SECTION}.${this.LAST_ACTIVITY_KEY}`, now, vscode.ConfigurationTarget.Global)
	}

	/**
	 * Validate email format
	 */
	static isValidEmail(email: string): boolean {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		return emailRegex.test(email)
	}

	/**
	 * Show welcome message after email registration
	 */
	static async showWelcomeMessage(email: string): Promise<void> {
		const message = `🎉 Thanks buddy! Your email ${email} has been registered with Cline.\n\nAll your IPFS commits and summaries will now be associated with your email. You'll receive notifications about your activity!`
		
		const request: ShowMessageRequest = {
			type: ShowMessageType.INFORMATION,
			message,
			options: {
				modal: true,
				items: ["Got it!", "View Settings"],
				detail: undefined
			}
		}

		const result = await HostProvider.window.showMessage(request)

		if (result.selectedOption === "View Settings") {
			await HostProvider.window.openSettings({
				query: "cline.mcxProtocol"
			})
		}
	}

	/**
	 * Prompt user for email registration
	 */
	static async promptForEmailRegistration(): Promise<string | null> {
		const request: ShowInputBoxRequest = {
			title: "Welcome to Cline! Please enter your email address to get started",
			prompt: "your.email@example.com",
			value: undefined
		}

		const response = await HostProvider.window.showInputBox(request)
		const email = response.response

		if (!email) {
			return null
		}

		if (!this.isValidEmail(email)) {
			await HostProvider.window.showMessage({
				type: ShowMessageType.ERROR,
				message: "Please enter a valid email address",
				options: { items: [], modal: false, detail: undefined }
			})
			return null
		}

		return email
	}

	/**
	 * Check and handle user registration on extension startup
	 */
	static async handleUserRegistration(): Promise<boolean> {
		const existingEmail = this.getUserEmail()
		
		if (existingEmail) {
			// User already registered, update last activity
			await this.updateLastActivity()
			return true
		}

		// New user - prompt for email
		const email = await this.promptForEmailRegistration()
		
		if (!email) {
			await HostProvider.window.showMessage({
				type: ShowMessageType.WARNING,
				message: "Email registration is required to use Cline's IPFS features. Please restart the extension and provide your email.",
				options: { items: [], modal: false, detail: undefined }
			})
			return false
		}

		// Save user profile
		await this.saveUserProfile(email)
		
		// Show welcome message
		await this.showWelcomeMessage(email)
		
		// Send welcome email (if email service is available)
		await this.sendWelcomeEmail(email)
		
		return true
	}

	/**
	 * Send welcome email to user
	 */
	static async sendWelcomeEmail(email: string): Promise<void> {
		try {
			// For now, just log that we would send an email
			// You can integrate with an email service like SendGrid, Nodemailer, etc.
			console.log(`[EMAIL] Would send welcome email to: ${email}`)
			
			// TODO: Implement actual email sending
			// const emailService = new EmailService()
			// await emailService.sendWelcomeEmail(email)
			
		} catch (error) {
			console.error("Failed to send welcome email:", error)
		}
	}

	/**
	 * Send IPFS commit notification email
	 */
	static async sendIPFSCommitNotification(email: string, cid: string, summaryType: string): Promise<void> {
		try {
			console.log(`[EMAIL] Would send IPFS commit notification to: ${email}`)
			console.log(`[EMAIL] CID: ${cid}, Type: ${summaryType}`)
			
			// TODO: Implement actual email sending
			// const emailService = new EmailService()
			// await emailService.sendIPFSCommitNotification(email, cid, summaryType)
			
		} catch (error) {
			console.error("Failed to send IPFS commit notification:", error)
		}
	}
}