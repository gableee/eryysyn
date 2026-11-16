from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str
    supabase_url: str
    supabase_secret_key: str

    # The LLM that writes answers. Defaults mean .env needs no change; override with OLLAMA_MODEL=... to compare models.
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "bonsai-2:4b"
    ollama_timeout_seconds: float = 180  # the first call loads the model into memory (~45 s here)

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()