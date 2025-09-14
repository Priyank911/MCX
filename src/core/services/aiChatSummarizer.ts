import * as fs from 'fs';
import * as path from 'path';
import { Controller } from '../controller';
import { ClineMessage } from '../../shared/ExtensionMessage';
import { GroqHandler } from '../api/providers/groq';
import { Anthropic } from '@anthropic-ai/sdk';
import { EnvConfig } from '../config/env';

interface AIChatSummary {
    sessionId: string;
    timestamp: string;
    messageCount: number;
    aiSummary: {
        overview: string;
        keyTopics: string[];
        mainConversations: ConversationBlock[];
        technicalDetails: {
            technologies: string[];
            filesDiscussed: string[];
            problemsSolved: string[];
            decisionsDecade: string[];
        };
        actionItems: string[];
        insights: string[];
        accuracy: number;
    };
    metadata: {
        model: string;
        processingTime: number;
        tokenUsage?: {
            input: number;
            output: number;
        };
    };
}

interface ConversationBlock {
    id: string;
    timeRange: string;
    summary: string;
    keyPoints: string[];
    outcomes: string[];
}

export class AIChatSummarizer {
    private controller: Controller;
    private groqHandler: GroqHandler;
    private extensionPath: string;

    constructor(controller: Controller, extensionPath?: string) {
        this.controller = controller;
        this.extensionPath = extensionPath || '';
        
        // Load environment configuration
        const groqApiKey = EnvConfig.getGroqApiKey(this.extensionPath);
        const groqModelId = EnvConfig.getGroqModelId(this.extensionPath);
        
        // Initialize Groq handler with environment variables
        this.groqHandler = new GroqHandler({
            groqApiKey: groqApiKey,
            groqModelId: groqModelId
        });
    }

    /**
     * Main method to summarize chat history using AI
     */
    async summarizeAndSaveHistory(): Promise<void> {
        const startTime = Date.now();
        
        try {
            console.log('Starting AI-powered chat summarization...');
            
            // Get chat data
            const state = await this.controller.getStateToPostToWebview();
            const clineMessages = this.controller.task?.messageStateHandler.getClineMessages() || [];
            
            if (clineMessages.length === 0) {
                throw new Error('No chat messages found to summarize.');
            }

            // Get workspace root
            const workspaceRoots = state.workspaceRoots;
            if (!workspaceRoots || workspaceRoots.length === 0) {
                throw new Error('No workspace root found');
            }
            
            const workspaceRoot = workspaceRoots[state.primaryRootIndex]?.path || workspaceRoots[0]?.path;
            if (!workspaceRoot) {
                throw new Error('Unable to determine workspace root path');
            }

            // Prepare conversation data for AI
            const conversationText = this.prepareConversationForAI(clineMessages);
            
            // Generate AI summary
            const aiSummary = await this.generateAISummary(conversationText, clineMessages.length);
            
            // Create comprehensive summary
            const summary: AIChatSummary = {
                sessionId: this.generateSessionId(),
                timestamp: new Date().toISOString(),
                messageCount: clineMessages.length,
                aiSummary,
                metadata: {
                    model: EnvConfig.getGroqModelId(this.extensionPath),
                    processingTime: Date.now() - startTime
                }
            };

            // Save summary file
            const summaryFilePath = path.join(workspaceRoot, 'ai-summarize.json');
            await this.saveToFile(summary, summaryFilePath);
            
            console.log(`AI chat summary saved to: ${summaryFilePath}`);
            
        } catch (error) {
            console.error('Error during AI chat summarization:', error);
            throw error;
        }
    }

    /**
     * Prepares conversation data for AI processing
     */
    private prepareConversationForAI(messages: ClineMessage[]): string {
        let conversationText = '';
        
        messages.forEach((message, index) => {
            const timestamp = new Date(message.ts || Date.now()).toISOString();
            const messageType = message.type === 'ask' ? 'USER' : 'ASSISTANT';
            const content = this.extractMessageContent(message);
            
            conversationText += `[${index + 1}] ${timestamp} - ${messageType}:\n${content}\n\n`;
        });

        return conversationText;
    }

    /**
     * Extracts content from ClineMessage
     */
    private extractMessageContent(message: ClineMessage): string {
        if (message.text && typeof message.text === 'string') {
            return message.text;
        }
        
        let content = '';
        if (message.ask) {
            content += `Ask: ${message.ask}`;
        }
        if (message.say) {
            content += `Say: ${JSON.stringify(message.say)}`;
        }
        
        // Include reasoning if available
        if (message.reasoning) {
            content += `\nReasoning: ${message.reasoning}`;
        }

        // Include file references
        if (message.files && message.files.length > 0) {
            content += `\nFiles: ${message.files.join(', ')}`;
        }

        return content || 'No content available';
    }

    /**
     * Generates AI-powered summary using Groq
     */
    private async generateAISummary(conversationText: string, messageCount: number): Promise<AIChatSummary['aiSummary']> {
        const systemPrompt = `You are an expert AI assistant specialized in analyzing and summarizing technical conversations and coding sessions. Your task is to provide comprehensive, accurate summaries of chat conversations between users and AI coding assistants.

Analyze the conversation and provide a structured summary that includes:
1. High-level overview of the entire session
2. Key topics and themes discussed
3. Main conversation blocks (grouped by topic/time)
4. Technical details (technologies, files, problems solved, decisions made)
5. Action items and next steps
6. Key insights and outcomes

Focus on accuracy, context preservation, and technical detail extraction. The summary should be useful for someone who wants to understand what was accomplished and what the key decisions were.

Provide your response in JSON format matching this structure:
{
  "overview": "Brief 2-3 sentence overview of the entire session",
  "keyTopics": ["topic1", "topic2", "topic3"],
  "mainConversations": [
    {
      "id": "conv1",
      "timeRange": "approximate time range",
      "summary": "what this conversation block was about",
      "keyPoints": ["point1", "point2"],
      "outcomes": ["outcome1", "outcome2"]
    }
  ],
  "technicalDetails": {
    "technologies": ["tech1", "tech2"],
    "filesDiscussed": ["file1", "file2"],
    "problemsSolved": ["problem1", "problem2"],
    "decisionsDecade": ["decision1", "decision2"]
  },
  "actionItems": ["action1", "action2"],
  "insights": ["insight1", "insight2"],
  "accuracy": 85
}

Be thorough but concise. Aim for 80-90% accuracy in context preservation.`;

        const messages: Anthropic.Messages.MessageParam[] = [
            {
                role: 'user',
                content: `Please analyze and summarize this coding conversation (${messageCount} messages total):\n\n${conversationText}`
            }
        ];

        try {
            // Create AI request
            const stream = this.groqHandler.createMessage(systemPrompt, messages);
            
            // Collect response
            let fullResponse = '';
            for await (const chunk of stream) {
                if (chunk.type === 'text') {
                    fullResponse += chunk.text;
                }
            }

            // Parse JSON response
            const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('AI response did not contain valid JSON');
            }

            const aiResponse = JSON.parse(jsonMatch[0]);
            
            // Validate and return structured response
            return {
                overview: aiResponse.overview || 'No overview provided',
                keyTopics: Array.isArray(aiResponse.keyTopics) ? aiResponse.keyTopics : [],
                mainConversations: Array.isArray(aiResponse.mainConversations) 
                    ? aiResponse.mainConversations.map((conv: any, index: number) => ({
                        id: conv.id || `conversation-${index + 1}`,
                        timeRange: conv.timeRange || 'Unknown time range',
                        summary: conv.summary || 'No summary available',
                        keyPoints: Array.isArray(conv.keyPoints) ? conv.keyPoints : [],
                        outcomes: Array.isArray(conv.outcomes) ? conv.outcomes : []
                    }))
                    : [],
                technicalDetails: {
                    technologies: Array.isArray(aiResponse.technicalDetails?.technologies) 
                        ? aiResponse.technicalDetails.technologies : [],
                    filesDiscussed: Array.isArray(aiResponse.technicalDetails?.filesDiscussed) 
                        ? aiResponse.technicalDetails.filesDiscussed : [],
                    problemsSolved: Array.isArray(aiResponse.technicalDetails?.problemsSolved) 
                        ? aiResponse.technicalDetails.problemsSolved : [],
                    decisionsDecade: Array.isArray(aiResponse.technicalDetails?.decisionsDecade) 
                        ? aiResponse.technicalDetails.decisionsDecade : []
                },
                actionItems: Array.isArray(aiResponse.actionItems) ? aiResponse.actionItems : [],
                insights: Array.isArray(aiResponse.insights) ? aiResponse.insights : [],
                accuracy: typeof aiResponse.accuracy === 'number' ? aiResponse.accuracy : 85
            };

        } catch (error) {
            console.error('Error generating AI summary:', error);
            throw new Error(`Failed to generate AI summary: ${error.message}`);
        }
    }

    /**
     * Generates a unique session ID
     */
    private generateSessionId(): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `ai-session-${timestamp}-${random}`;
    }

    /**
     * Saves the summary to a file
     */
    private async saveToFile(summary: AIChatSummary, filePath: string): Promise<void> {
        const jsonContent = JSON.stringify(summary, null, 2);
        
        // Ensure directory exists
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        // Write file
        await fs.promises.writeFile(filePath, jsonContent, 'utf8');
    }
}

/**
 * Creates and returns an AI chat summarizer instance
 */
export function createAIChatSummarizer(controller: Controller, extensionPath?: string): AIChatSummarizer {
    return new AIChatSummarizer(controller, extensionPath);
}

/**
 * Convenience function to run AI summarization
 */
export async function summarizeChatHistoryWithAI(controller: Controller, extensionPath?: string): Promise<void> {
    // Check if environment is configured
    if (!EnvConfig.isConfigured(extensionPath)) {
        throw new Error('Groq API configuration missing. Please check your .env file or environment variables.');
    }
    
    const summarizer = createAIChatSummarizer(controller, extensionPath);
    await summarizer.summarizeAndSaveHistory();
}