import * as fs from 'fs';
import * as path from 'path';

interface EnvironmentConfig {
    GROQ_API_KEY?: string;
    GROQ_MODEL_ID?: string;
}

/**
 * Simple environment configuration loader for VS Code extension
 * Loads from .env file or process.env
 */
export class EnvConfig {
    private static config: EnvironmentConfig | null = null;

    /**
     * Load environment configuration
     */
    static load(extensionPath?: string): EnvironmentConfig {
        if (this.config) {
            return this.config;
        }

        this.config = {};

        // Try to load from .env file if extension path is provided
        if (extensionPath) {
            try {
                const envPath = path.join(extensionPath, '.env');
                if (fs.existsSync(envPath)) {
                    const envContent = fs.readFileSync(envPath, 'utf8');
                    const envLines = envContent.split('\n');
                    
                    for (const line of envLines) {
                        const trimmedLine = line.trim();
                        if (trimmedLine && !trimmedLine.startsWith('#')) {
                            const [key, ...valueParts] = trimmedLine.split('=');
                            if (key && valueParts.length > 0) {
                                const value = valueParts.join('=').trim();
                                // Remove surrounding quotes if present
                                const cleanValue = value.replace(/^["'](.*)["']$/, '$1');
                                (this.config as any)[key.trim()] = cleanValue;
                            }
                        }
                    }
                }
            } catch (error) {
                console.warn('Could not load .env file:', error);
            }
        }

        // Fall back to process.env for any missing values
        this.config.GROQ_API_KEY = this.config.GROQ_API_KEY || process.env.GROQ_API_KEY;
        this.config.GROQ_MODEL_ID = this.config.GROQ_MODEL_ID || process.env.GROQ_MODEL_ID || 'llama-3.1-70b-versatile';

        return this.config;
    }

    /**
     * Get Groq API key
     */
    static getGroqApiKey(extensionPath?: string): string {
        const config = this.load(extensionPath);
        if (!config.GROQ_API_KEY) {
            throw new Error('GROQ_API_KEY not found in environment variables or .env file. Please check your configuration.');
        }
        return config.GROQ_API_KEY;
    }

    /**
     * Get Groq model ID
     */
    static getGroqModelId(extensionPath?: string): string {
        const config = this.load(extensionPath);
        return config.GROQ_MODEL_ID || 'llama-3.1-70b-versatile';
    }

    /**
     * Check if environment is properly configured
     */
    static isConfigured(extensionPath?: string): boolean {
        try {
            const config = this.load(extensionPath);
            return !!config.GROQ_API_KEY;
        } catch {
            return false;
        }
    }

    /**
     * Reset configuration (useful for testing)
     */
    static reset(): void {
        this.config = null;
    }
}

export default EnvConfig;