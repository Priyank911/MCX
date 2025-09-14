import { EnvConfig } from '../config/env';

/**
 * Simple test utility to verify environment configuration
 */
export class EnvConfigTest {
    static testConfiguration(extensionPath?: string): {
        isConfigured: boolean;
        hasApiKey: boolean;
        modelId: string;
        errors: string[];
    } {
        const errors: string[] = [];
        let isConfigured = false;
        let hasApiKey = false;
        let modelId = '';

        try {
            // Test if configuration can be loaded
            isConfigured = EnvConfig.isConfigured(extensionPath);
            
            // Test API key
            try {
                const apiKey = EnvConfig.getGroqApiKey(extensionPath);
                hasApiKey = !!apiKey && apiKey.length > 0;
                if (!hasApiKey) {
                    errors.push('API key is empty or invalid');
                }
            } catch (error) {
                errors.push(`API key error: ${error.message}`);
            }

            // Test model ID
            try {
                modelId = EnvConfig.getGroqModelId(extensionPath);
                if (!modelId) {
                    errors.push('Model ID is empty');
                }
            } catch (error) {
                errors.push(`Model ID error: ${error.message}`);
            }

        } catch (error) {
            errors.push(`Configuration error: ${error.message}`);
        }

        return {
            isConfigured,
            hasApiKey,
            modelId,
            errors
        };
    }

    static logTestResults(extensionPath?: string): void {
        const results = this.testConfiguration(extensionPath);
        
        console.log('=== Environment Configuration Test ===');
        console.log(`Configured: ${results.isConfigured ? '✅' : '❌'}`);
        console.log(`API Key: ${results.hasApiKey ? '✅' : '❌'}`);
        console.log(`Model ID: ${results.modelId || 'Not set'}`);
        
        if (results.errors.length > 0) {
            console.log('Errors:');
            results.errors.forEach(error => console.log(`  ❌ ${error}`));
        } else {
            console.log('✅ All tests passed!');
        }
        console.log('=====================================');
    }
}

export default EnvConfigTest;