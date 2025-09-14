# AI Chat Summarization Setup

This extension includes AI-powered chat summarization using Groq API. To use this feature, you need to configure your environment variables.

## Setup Instructions

### 1. Environment Configuration

Copy the example environment file and add your API key:

```bash
cp .env.example .env
```

### 2. Edit .env file

Open the `.env` file and add your Groq API key:

```env
# Groq API Configuration
GROQ_API_KEY=your_actual_groq_api_key_here

# Optional: Groq Model Configuration  
GROQ_MODEL_ID=llama-3.1-70b-versatile
```

### 3. Get Groq API Key

1. Visit [Groq Console](https://console.groq.com/)
2. Sign up or log in to your account
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key and paste it in your `.env` file

### 4. Security Notes

- **Never commit your `.env` file** to version control
- The `.env` file is already added to `.gitignore`
- Use `.env.example` as a template for team members
- Keep your API key secure and private

### 5. Usage

Once configured, you can use the AI chat summarization feature:

1. Have a conversation with the Cline assistant
2. Click the plugin button (⚙️) in the Cline interface
3. Select "Commit" from the dropdown
4. The AI will analyze your conversation and create `ai-summarize.json`

### 6. Troubleshooting

**Error: "Groq API configuration missing"**
- Ensure your `.env` file exists in the project root
- Verify `GROQ_API_KEY` is set correctly
- Check that there are no extra spaces or quotes around the key

**Error: "GROQ_API_KEY not found"**
- Double-check your API key in the Groq console
- Ensure the key is active and has proper permissions
- Try regenerating the API key if needed

### 7. Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GROQ_API_KEY` | Yes | - | Your Groq API key for AI summarization |
| `GROQ_MODEL_ID` | No | `llama-3.1-70b-versatile` | Groq model to use for summarization |

### 8. Features

The AI summarization provides:
- 🧠 **Intelligent Analysis**: Deep understanding of technical conversations
- 📊 **Structured Output**: Organized summaries with key topics and decisions
- 🔍 **Context Preservation**: High accuracy context understanding (85-95%)
- ⚡ **Fast Processing**: Optimized for quick summarization
- 📁 **Easy Access**: Results saved as `ai-summarize.json` in your workspace

## Development

If you're contributing to this project:

1. Always use `.env.example` for documenting required variables
2. Never commit actual API keys or secrets
3. Test with different environment configurations
4. Update this README when adding new environment variables